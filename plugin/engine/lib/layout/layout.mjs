// __Final Renderings toolkit, driven by a per-project `site` object instead of a hard-coded catalog:
//   site = { device: '{GUID}', placeholders: { hero, main }, components: { key: { name, renderingId, ph, params? } } }
// `ph` is 'hero', 'main', or the name of a dynamic child placeholder ('accordion', 'cardlist', ...).
//
// A page whose whole layout is a Final Renderings delta over an empty shared layout, on one device,
// can be rebuilt: existing <r> elements are kept byte-for-byte except their p:before/p:after position
// attributes, which are regenerated as a chain in the new order. layoutGuards() lists the reasons a
// page must be refused instead.
import crypto from 'node:crypto';
import { normId, braced } from '../cm/ids.mjs';

const attr = (raw, name) => raw.match(new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`))?.[1];
const decodeAttr = (s) => (s || '').replace(/&amp;/g, '&');
const encPar = (s) => s.replace(/&/g, '&amp;');
const newUid = () => `{${crypto.randomUUID().toUpperCase()}}`;
const bare = (id) => normId(id).toUpperCase(); // 32 hex, no braces or dashes, any input format

export const byRenderingId = (id, site) => Object.keys(site.components).find((k) => bare(site.components[k].renderingId) === bare(id)) || null;

export function parseLayout(xml, site) {
  const devices = [...(xml || '').matchAll(/<d\s[^>]*id="([^"]+)"/g)].map((m) => m[1].toUpperCase());
  const entries = [];
  for (const m of (xml || '').matchAll(/<r\s(?![^>]*xmlns:p=)[^>]*?\/>|<r\s(?![^>]*xmlns:p=)[^>]*?>[\s\S]*?<\/r>/g)) {
    const raw = m[0];
    if (/^<r\s+xmlns/.test(raw)) continue;
    const id = attr(raw, 's:id') || attr(raw, 'id');
    if (!id) continue;
    const par = decodeAttr(attr(raw, 's:par'));
    entries.push({
      raw,
      uid: (attr(raw, 'uid') || '').toUpperCase(),
      renderingId: bare(id),
      key: byRenderingId(id, site),
      ds: decodeAttr(attr(raw, 's:ds')) || '',
      ph: decodeAttr(attr(raw, 's:ph')) || '',
      par,
      dynId: +(par.match(/(?:^|&)DynamicPlaceholderId=(\d+)/)?.[1] ?? NaN),
      theme: readTheme(par),
      hasChildMarkup: /<r\s[^>]*>[\s\S]*<\/r>$/.test(raw),
    });
  }
  return { devices, entries };
}

/** Does a shared (__Renderings) layout contain any renderings? */
export const sharedHasRenderings = (xml) => /<r\s[^>]*(s:id|\bid)="\{/.test((xml || '').replace(/^<r\s[^>]*>/, ''));

export function newEntry({ key, ds, ph, dynId }, site) {
  const c = site.components[key];
  if (!c) throw new Error(`Unknown component key "${key}"`);
  const par = `${(c.params || 'GridParameters&FieldNames&Styles&RenderingIdentifier&CSSStyles').replace(/&?selectTheme=[^&]*/, '')}&DynamicPlaceholderId=${dynId}`;
  return { isNew: true, uid: newUid(), renderingId: bare(c.renderingId), key, ds, ph, par, dynId, theme: '' };
}

/**
 * selectTheme as Sitecore will read it. The key can appear bare, empty, once, or twice after a bad
 * write; Sitecore merges duplicates into one comma-joined value no component recognises. Anything
 * but one clean value comes back as "!<raw>" so a plan always rewrites it.
 */
export function readTheme(par) {
  const parts = String(par || '').split('&').filter((x) => /^selectTheme(=|$)/.test(x));
  if (!parts.length) return '';
  const vals = parts.map((x) => { try { return decodeURIComponent(x.slice('selectTheme'.length + 1)); } catch { return x; } });
  if (parts.length > 1 || /,/.test(vals[0])) return '!' + vals.join('|');
  return vals[0];
}

/** Set selectTheme in a decoded rendering parameter string: exactly one key, in place of the first. */
export function withTheme(par, theme) {
  const parts = String(par || '').split('&').filter((x) => x !== '');
  const out = []; let set = false;
  for (const x of parts) { if (/^selectTheme(=|$)/.test(x)) { if (!set) { out.push(`selectTheme=${theme}`); set = true; } continue; } out.push(x); }
  if (!set) out.push(`selectTheme=${theme}`);
  return out.join('&');
}

/** Top-level components go in hero or main; child renderings in their parent's dynamic placeholder (`<ph>-<parentDynId>`). */
export const placeholderFor = (key, parentDynId, site) => {
  const c = site.components[key];
  if (!c) throw new Error(`Unknown component key "${key}"`);
  if (c.ph === 'hero') return site.placeholders.hero;
  if (c.ph === 'main') return site.placeholders.main;
  return `${site.placeholders.main}/${c.ph}-${parentDynId}`;
};

/** Build a full __Final Renderings value from ordered entries (existing or new; wantDs / wantTheme honoured). */
export function buildLayout(entries, site) {
  const out = entries.map((e, i) => {
    const pos = i === 0 ? 'p:before="*"' : `p:after="r[@uid='${entries[i - 1].uid}']"`;
    if (!e.isNew) {
      let stripped = e.raw.replace(/\sp:(before|after)="[^"]*"/g, '');
      if (e.wantDs && e.wantDs !== e.ds) stripped = /\ss:ds="[^"]*"/.test(stripped) ? stripped.replace(/\ss:ds="[^"]*"/, ` s:ds="${encPar(e.wantDs)}"`) : stripped.replace(/\ss:id="/, ` s:ds="${encPar(e.wantDs)}" s:id="`);
      if (e.wantTheme && e.wantTheme !== e.theme) stripped = stripped.replace(/\ss:par="([^"]*)"/, (m, p) => ` s:par="${encPar(withTheme(p.replace(/&amp;/g, '&'), e.wantTheme))}"`);
      return /^<r uid="[^"]+"/.test(stripped)
        ? stripped.replace(/^<r uid="([^"]+)"/, `<r uid="$1" ${pos}`)
        : stripped.replace(/^<r\s/, `<r ${pos} `);
    }
    const ds = e.ds ? ` s:ds="${encPar(e.ds)}"` : '';
    const par = e.wantTheme ? withTheme(e.par, e.wantTheme) : e.par;
    return `<r uid="${e.uid}" ${pos}${ds} s:id="${braced(e.renderingId)}" s:par="${encPar(par)}" s:ph="${encPar(e.ph)}" />`;
  });
  return `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="${site.device}">${out.join('')}</d></r>`;
}

/** Theme each entry renders with (wanted if set, else current), for display and verification. */
export const themesOf = (entries) => entries.map((e) => (e.wantTheme ?? e.theme ?? '').replace(/^Themes/, ''));

/** Component names in layout order, for display and verification. */
export const describe = (entries, site) => entries.map((e) => (e.key ? site.components[e.key].name : `Unknown rendering ${braced(e.renderingId)}`));

/** Reasons a page's layout must not be rewritten. Empty array = safe to rebuild. */
export function layoutGuards(xml, sharedXml, site) {
  const reasons = [];
  const { devices, entries } = parseLayout(xml, site);
  if (devices.length > 1) reasons.push(`Layout has ${devices.length} devices; only one is supported`);
  if (sharedHasRenderings(sharedXml)) reasons.push('Shared layout (__Renderings) has renderings; only Final Renderings deltas are supported');
  if (/<rls\b/i.test(xml || '')) reasons.push('Layout has personalization rules');
  for (const e of entries) if (!e.key) reasons.push(`Unknown rendering ${braced(e.renderingId)} (not in the catalog)`);
  return reasons;
}

// Field value builders: content JSON values → Sitecore field strings, by field type. Copy is never
// corrected; a placeholder token anywhere in a value holds the field as pending instead of writing it.
import { braced } from '../cm/ids.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const HEX32 = /^[0-9a-f]{32}$/i;
const FILE = /\.(pdf|docx?|xlsx?|csv|pptx?|zip)(\?|#|$)/i;

export function hasPlaceholder(value, tokens = []) {
  const strings = [];
  const walk = (v) => { if (typeof v === 'string') strings.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(value);
  for (const s of strings) for (const t of tokens) if (s.toLowerCase().includes(String(t).toLowerCase())) return t;
  return null;
}

export function linkXml(link, newTab = { external: true, internal: false, files: true }) {
  if (!link || (!link.text && !link.url && !link.id)) return '';
  const text = esc(link.text);
  const anchor = esc(link.anchor || '');
  if (link.id) return `<link text="${text}" linktype="internal" class="" title="" target="${link.target === '_blank' || (newTab.internal && !link.target) ? '_blank' : ''}" querystring="${esc(link.querystring || '')}" anchor="${anchor}" id="${braced(link.id)}" />`;
  const url = String(link.url || '');
  if (/^mailto:/i.test(url)) return `<link text="${text}" linktype="mailto" url="${esc(url)}" anchor="" target="" />`;
  if (/^tel:/i.test(url)) return `<link text="${text}" linktype="external" url="${esc(url)}" anchor="" target="" />`;
  const isInternal = url.startsWith('/');
  const blank = link.target ? link.target === '_blank' : (FILE.test(url) && newTab.files) || (isInternal ? newTab.internal : newTab.external);
  return `<link text="${text}" linktype="external" url="${esc(url)}" anchor="${anchor}" target="${blank ? '_blank' : ''}" />`;
}

const LIST_TYPES = /^(Multilist|Multilist with Search|Treelist|TreelistEx|Checklist|Multiroot Treelist)$/i;
const ONE_TYPES = /^(Droplink|Droptree|Grouped Droplink)$/i;
const TEXT_TYPES = /^(Single-Line Text|Multi-Line Text|Rich Text|Integer|Number|Checkbox|Date|Datetime|Password)$/i;

export function buildFieldValue(fieldDef, value, { rules }) {
  const type = fieldDef?.type || '';
  const tok = hasPlaceholder(value, rules.placeholders);
  if (tok) return { pending: { category: 'placeholder', text: `${fieldDef.name}: contains "${tok}"; not written` } };
  if (value == null) return { value: '' };
  if (/^General Link/i.test(type)) {
    const link = typeof value === 'string' ? { url: value } : value;
    return { value: linkXml(link, rules.newTab) };
  }
  if (LIST_TYPES.test(type)) {
    const arr = Array.isArray(value) ? value : String(value).split('|').filter(Boolean);
    if (!arr.every((x) => HEX32.test(String(x).replace(/[{}-]/g, '')))) return { pending: { category: 'no-field', text: `${fieldDef.name}: list values must be item ids; got ${JSON.stringify(arr).slice(0, 80)}` } };
    return { value: arr.map(braced).join('|') };
  }
  if (ONE_TYPES.test(type)) {
    if (!HEX32.test(String(value).replace(/[{}-]/g, ''))) return { pending: { category: 'no-field', text: `${fieldDef.name}: value must be an item id; got ${String(value).slice(0, 80)}` } };
    return { value: braced(value) };
  }
  if (/^Image/i.test(type)) return { value: typeof value === 'string' ? value : JSON.stringify(value) };
  if (TEXT_TYPES.test(type) || typeof value === 'string') return { value: typeof value === 'string' ? value : String(value) };
  return { pending: { category: 'no-field', text: `${fieldDef.name}: no builder for type "${type}" with a ${Array.isArray(value) ? 'list' : typeof value} value` } };
}

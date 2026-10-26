// Reference index: which items point at which targets, and how.
//   id            — any GUID format in any field
//   local: path   — a `local:/Data/...` datasource resolved against the referring item's path
//   sitecore path — a literal item path under the scanned root
//   URL           — a page-like target's URL (path under homePath, excluding Data) in href= / url= text
// System fields that change on every save are skipped.
const SKIP = /^__(Revision|Created|Updated|Owner|Lock|Valid|Workflow|Sortorder|Display name|Base template)/;
const GUID = /\{?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})\}?/gi;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildRefIndex({ tree, fields, targets, homePath }) {
  const byId = new Map(tree.map((t) => [t.id, t]));
  const byPath = new Map(tree.map((t) => [t.path.toLowerCase(), t]));
  const home = (homePath || '').replace(/\/$/, '');
  const isPageLike = (t) => !!(fields[t.id]?.f?.['__Renderings'] || fields[t.id]?.f?.['__Final Renderings']) || /Page$/.test(t.templateName || '');
  const urlOf = (t) => (home && t.path.toLowerCase().startsWith(home.toLowerCase() + '/') && !/\/data(\/|$)/i.test(t.path.slice(home.length)) ? t.path.slice(home.length).toLowerCase() : null);
  const urlTargets = [...targets].map((id) => byId.get(id)).filter((t) => t && isPageLike(t) && urlOf(t)).map((t) => [urlOf(t), t.id]).sort((a, b) => b[0].length - a[0].length);

  const rootPath = tree.length ? tree.reduce((a, t) => (t.path.length < a.length ? t.path : a), tree[0].path) : '/sitecore';
  const PATH_RE = new RegExp(`${esc(rootPath)}/[^"'<>|&?]+`, 'gi');
  const refs = [];
  const seen = new Set();
  const add = (from, field, target, how) => {
    const k = `${from.id}|${field}|${target}|${how}`;
    if (seen.has(k)) return; seen.add(k);
    refs.push({ from: from.id, field, target, how });
  };
  for (const t of tree) {
    const f = fields[t.id]?.f || {};
    for (const [name, val] of Object.entries(f)) {
      if (SKIP.test(name) || typeof val !== 'string') continue;
      for (const m of val.matchAll(GUID)) { const id = m.slice(1).join('').toLowerCase(); if (id !== t.id && targets.has(id)) add(t, name, id, 'id'); }
      for (const m of val.matchAll(/local:([^"&|<]+)/g)) { const x = byPath.get((t.path + m[1]).toLowerCase()); if (x && targets.has(x.id)) add(t, name, x.id, 'local: path'); }
      for (const m of val.matchAll(PATH_RE)) { const x = byPath.get(m[0].toLowerCase().replace(/\/$/, '')); if (x && targets.has(x.id)) add(t, name, x.id, 'sitecore path'); }
      const low = val.toLowerCase();
      if (urlTargets.length && (low.includes('href') || low.includes('url=') || low.includes('/'))) {
        for (const [u, id] of urlTargets) {
          if (!low.includes(u)) continue;
          const re = new RegExp(`(href=|url=|^)["']?(https?://[^/"'\\s]*)?${esc(u)}(?=$|["'/?#\\s&])`, 'im');
          if (re.test(low)) { add(t, name, id, 'URL'); break; }
        }
      }
    }
  }
  const byTarget = new Map();
  for (const r of refs) { if (!byTarget.has(r.target)) byTarget.set(r.target, []); byTarget.get(r.target).push(r); }
  return { refs, byTarget };
}

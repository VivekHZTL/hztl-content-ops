// Content JSON: the one shape every adapter produces and the planner consumes (spec 5.3).
export const FLAG_KINDS = ['missing-image', 'missing-url', 'suspect-link', 'pid-fix', 'char-limit', 'over-variant', 'video-url', 'confirm', 'sensitive', 'dev-note', 'placeholder', 'unmapped', 'do-not-author', 'hold', 'link-pending', 'new-adapter', 'other'];

export function newContent({ pageId, pageType, targetPath, mode = 'update' }) {
  return { pageId, pageType, target: { path: targetPath, mode }, pageFields: {}, components: [], flags: [], sources: [], locators: {} };
}

export function validateContent(c, catalog = null) {
  const errors = [];
  if (!c || typeof c !== 'object') return ['content is not an object'];
  if (!c.pageId) errors.push('pageId is required');
  if (!c.target?.path) errors.push('target.path is required');
  if (!Array.isArray(c.components)) errors.push('components must be an array');
  for (const [i, f] of (c.flags || []).entries()) if (!FLAG_KINDS.includes(f?.kind)) errors.push(`flags[${i}].kind "${f?.kind}" is not one of ${FLAG_KINDS.join(', ')}`);
  for (const [i, s] of (c.sources || []).entries()) if (!s?.file) errors.push(`sources[${i}].file is required`);
  const walk = (comp, where, parentKey) => {
    if (!comp || typeof comp.type !== 'string') { errors.push(`${where}.type must be a string`); return; }
    if (comp.fields && typeof comp.fields !== 'object') errors.push(`${where}.fields must be an object`);
    if (comp.children && !Array.isArray(comp.children)) errors.push(`${where}.children must be an array`);
    if (comp.type === 'other') { if (typeof comp.raw !== 'string') errors.push(`${where} (other) needs a raw string`); return; }
    if (catalog) {
      const def = catalog.components?.[comp.type];
      if (!def) errors.push(`${where}.type "${comp.type}" is not in the catalog`);
      else {
        for (const f of Object.keys(comp.fields || {})) if (!f.startsWith('__') && !def.fields.some((d) => d.name === f)) errors.push(`${where}.fields.${f} is not a field of ${comp.type}`);
        if (parentKey && !(catalog.components[parentKey]?.children || []).includes(comp.type)) errors.push(`${where}.type "${comp.type}" is not a child of ${parentKey}`);
      }
    }
    (comp.children || []).forEach((ch, j) => walk(ch, `${where}.children[${j}]`, comp.type));
  };
  (Array.isArray(c.components) ? c.components : []).forEach((comp, i) => walk(comp, `components[${i}]`, null));
  return errors;
}

// Catalog: the project's page types, components, fields and placeholders, generated from blueprint pages
// on the CM (lib/catalog/build.mjs). The only source of rendering, template and field IDs.
// A parent component exposes one dynamic child placeholder, `childPh` (e.g. 'accordion'); each child's `ph` equals it.
export const componentKey = (name) => {
  const words = String(name || '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const norm = (w, i) => { const lower = w.toLowerCase(); return i === 0 ? lower : lower[0].toUpperCase() + lower.slice(1); };
  return words.map(norm).join('');
};

export function validateCatalog(c) {
  const errors = [];
  if (!c || typeof c !== 'object') return ['catalog is not an object'];
  if (!c.device) errors.push('catalog.device is required');
  for (const k of ['hero', 'main']) if (!c.placeholders?.[k]) errors.push(`catalog.placeholders.${k} is required`);
  const comps = c.components || {};
  for (const [key, comp] of Object.entries(comps)) {
    for (const f of ['name', 'renderingId', 'ph']) if (!comp[f]) errors.push(`components.${key}.${f} is required`);
    if (comp.ph && !['hero', 'main'].includes(comp.ph)) {
      const parent = comps[comp.parent];
      if (!parent) errors.push(`components.${key}.parent "${comp.parent}" is not a component`);
      else if (parent.childPh !== comp.ph) errors.push(`components.${key}.ph "${comp.ph}" does not match its parent's childPh "${parent.childPh ?? ''}"`);
    }
    for (const ch of comp.children || []) if (!comps[ch]) errors.push(`components.${key}.children names unknown component "${ch}"`);
    if ((comp.placements || []).length > 1) errors.push(`components.${key} is placed both at the top level and nested on the blueprint pages; fix the blueprint or split the component`);
    if (['hero', 'main'].includes(comp.ph) && Object.values(comps).some((p) => (p.children || []).includes(key))) errors.push(`components.${key} is listed as a child but its ph is "${comp.ph}"; a component cannot be both top-level and nested`);
  }
  return errors;
}

/** The subset the layout toolkit takes as `site`. */
export const catalogToSite = (c) => ({
  device: c.device,
  placeholders: { hero: c.placeholders.hero, main: c.placeholders.main },
  components: Object.fromEntries(Object.entries(c.components || {}).map(([k, v]) => [k, { name: v.name, renderingId: v.renderingId, ph: v.ph, params: v.params }])),
});

// GUID helpers. Sitecore returns ids in several formats; the engine stores them as 32 lowercase hex.
export const normId = (id) => String(id || '').replace(/[{}-]/g, '').toLowerCase();
export const braced = (id) => { const h = normId(id).toUpperCase(); return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}}`; };
export const sameId = (a, b) => normId(a) === normId(b);

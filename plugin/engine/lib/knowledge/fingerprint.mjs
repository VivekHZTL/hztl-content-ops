// A sheet's shape: its tab name plus its header row, normalised. Order matters on purpose (spec 4.3).
import crypto from 'node:crypto';

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export function headerFingerprint(headers, tab) {
  const h = crypto.createHash('sha256');
  h.update(norm(tab)); h.update('\u0000');
  for (const x of headers) { h.update(norm(x)); h.update('\u0001'); }
  return h.digest('hex');
}

export function readTsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split('\t').map((h) => h.trim());
  return lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [headers[i] ?? `col${i}`, v.trim()])));
}

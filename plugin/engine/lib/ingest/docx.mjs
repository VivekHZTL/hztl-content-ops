// Word deck → annotated text: hyperlinks as ⟦text⟨url⟩ (⟦ marks where the anchor text starts), table cells ' | ',
// bullets '• ', paragraphs as lines.
import { unzip } from './xlsx.mjs';

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
/** Microsoft Defender (mcas) wraps links; recover the original URL. */
const unwrap = (u) => { let s = u.replace(/&amp;/g, '&'); const m = s.match(/[?&]originalUrl=([^&]+)/); if (m) s = decodeURIComponent(m[1]).replace(/\.mcas\.ms/g, '').replace(/[?&]McasTsid=\d+/, '').replace(/\?$/, ''); return s; };

export function docxToText(buffer) {
  const z = unzip(buffer);
  if (!z['word/document.xml']) throw new Error('Not a .docx (no word/document.xml)');
  const relsXml = z['word/_rels/document.xml.rels'] ? z['word/_rels/document.xml.rels']() : '';
  const rels = Object.fromEntries([...relsXml.matchAll(/<Relationship [^>]*>/g)].map((m) => [m[0].match(/Id="([^"]+)"/)?.[1], m[0].match(/Target="([^"]+)"/)?.[1]]).filter(([, t]) => /^(https?|mailto|tel):/i.test(t || '')).map(([i, t]) => [i, unwrap(t)]));
  let xml = z['word/document.xml']();
  xml = xml.replace(/<w:hyperlink [^>]*r:id="([^"]+)"[^>]*>([\s\S]*?)<\/w:hyperlink>/g, (m, id, inner) => `<w:t>⟦</w:t>${inner}<w:t>⟨${rels[id] || '?'}⟩</w:t>`);
  xml = xml.replace(/<w:numPr>/g, '<w:t>• </w:t><w:numPr>');
  xml = xml.replace(/<\/w:p>\s*<\/w:tc>/g, '</w:tc>'); // a cell's last paragraph ends the cell, not the line
  const text = xml
    .replace(/<\/w:tc>/g, '<w:t> | </w:t>')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g, (m, t) => `\u0001${t}\u0002`)
    .replace(/<[^>]+>/g, '')
    .replace(/\u0001([^\u0002]*)\u0002/g, '$1');
  return decode(text).split('\n').map((l) => l.replace(/\s+\|\s*$/, '').trimEnd()).filter((l, i, a) => l.trim() || (a[i - 1] || '').trim()).join('\n').trim();
}

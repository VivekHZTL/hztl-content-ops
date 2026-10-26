#!/usr/bin/env node
// Builds plugin/rollout/index.html from plugin/ROLLOUT.md. One markdown source, two homes (spec 5).
// Zero dependencies: a small, strict markdown subset (headings, paragraphs, lists, tables, fenced code,
// inline code, bold, links, diagram markers). Anything else throws so the page can never silently drift.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const collapse = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

function inline(src) {
  const codes = [];
  let s = esc(src).replace(/`([^`]+)`/g, (_, c) => { codes.push(`<code>${c}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => { if (!/^(https:\/\/|\/|#|rollout\/)/.test(u)) throw new Error(`unsupported link target "${u}"; use https://, /, # or rollout/`); return `<a href="${u}"${u.startsWith('https://') ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`; });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}

export function renderMarkdown(md, { diagrams }) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = []; const headings = [];
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { flush(); i++; continue; }
    if (/^\s{2,}([-*]\s|\d+\.\s)/.test(line)) throw new Error(`unsupported markdown: nested list near "${line.trim().slice(0, 40)}"; keep lists flat`);
    let m;
    if ((m = line.match(/^<!--\s*diagram:\s*([a-z0-9-]+)\s*-->\s*$/))) {
      flush();
      const svg = diagrams(m[1]);
      if (!svg) throw new Error(`No diagram "${m[1]}"`);
      out.push(`<figure class="diagram" data-diagram="${m[1]}">${svg.replace(/^\s*<\?xml[^>]*>\s*/, '')}</figure>`);
      i++;
      if (i < lines.length && /^!\[[^\]]*\]\([^)]+\)\s*$/.test(lines[i])) i++; // GitHub fallback image line
      continue;
    }
    if (/^<!--/.test(line)) throw new Error(`unsupported markdown: HTML comment that is not a diagram marker (<!-- diagram: lower-case-name -->): "${line.slice(0, 50)}"`);
    if ((m = line.match(/^(#{1,3})\s+(.+)$/))) { flush(); const lvl = m[1].length; const html = inline(m[2]); const id = slug(m[2]); if (lvl === 2) headings.push({ id, text: collapse(html.replace(/<[^>]+>/g, '')) }); out.push(`<h${lvl} id="${id}">${html}</h${lvl}>`); i++; continue; }
    if ((m = line.match(/^```(\w*)\s*$/))) {
      flush(); const lang = m[1]; const body = []; i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      if (i >= lines.length) throw new Error('unterminated code fence');
      i++;
      out.push(`<pre><code${lang ? ` class="lang-${lang}"` : ''}>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\|/.test(line)) {
      flush(); const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const [head, sep, ...body] = rows;
      if (!sep || !/^\|\s*:?-+/.test(sep)) throw new Error(`unsupported markdown: table without a separator row near "${head}"`);
      out.push(`<div class="table"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      flush(); const ordered = /^\d+\./.test(line); const items = [];
      const re = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      while (i < lines.length && re.test(lines[i])) { let item = lines[i].replace(re, ''); i++; while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i])) { if (/^\s{2,}([-*]\s|\d+\.\s)/.test(lines[i])) throw new Error(`unsupported markdown: nested list near "${lines[i].trim().slice(0, 40)}"; keep lists flat`); item += ' ' + lines[i++].trim(); } items.push(item); }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^>/.test(line)) throw new Error('unsupported markdown: blockquote');
    if (/^<(?!!--)/.test(line)) throw new Error(`unsupported markdown: raw HTML "${line.slice(0, 40)}"`);
    if (/^!\[/.test(line)) throw new Error('unsupported markdown: image outside a diagram marker');
    para.push(line.trim()); i++;
  }
  flush();
  const html = out.join('\n');
  const text = collapse(html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<\/?(code|strong|a|em)(\s[^>]*)?>/g, '').replace(/<[^>]+>/g, ' '));
  return { html, text, headings };
}

/** The markdown's visible text, so the test can prove the two homes say the same thing. */
export function mdText(md) {
  const out = []; let fence = false;
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    if (/^```/.test(raw)) { fence = !fence; continue; }
    if (fence) { out.push(raw); continue; }
    if (/^<!--\s*diagram:/.test(raw) || /^!\[[^\]]*\]\([^)]+\)\s*$/.test(raw)) continue;
    if (/^\|\s*:?-+/.test(raw)) continue;
    let s = raw.replace(/^#{1,3}\s+/, '').replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').replace(/\|/g, ' ');
    s = s.replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1').replace(/\*\*/g, '').replace(/`/g, '');
    out.push(s);
  }
  return collapse(out.join('\n'));
}

const CSS = `
:root{--paper:#F6F7F5;--surface:#FFFFFF;--ink:#1C2422;--muted:#5C6866;--border:#D6DCD9;--accent:#0F6E56;--accent-soft:#E1F5EE;--code-bg:#EEF1EF;
--d-line:#888780;--d-purple-bg:#EEEDFE;--d-purple-line:#534AB7;--d-purple-ink:#3C3489;--d-purple-sub:#534AB7;--d-teal-bg:#E1F5EE;--d-teal-line:#0F6E56;--d-teal-ink:#085041;--d-teal-sub:#0F6E56;--d-gray-bg:#F1EFE8;--d-gray-line:#5F5E5A;--d-gray-ink:#444441;--d-gray-sub:#5F5E5A;--d-coral-bg:#FAECE7;--d-coral-line:#993C1D;--d-coral-ink:#712B13;--d-coral-sub:#993C1D;}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark;--paper:#101514;--surface:#182020;--ink:#E4EAE7;--muted:#9AA6A2;--border:#2B3533;--accent:#5DCAA5;--accent-soft:#0F2F27;--code-bg:#1E2726;
--d-line:#B4B2A9;--d-purple-bg:#3C3489;--d-purple-line:#AFA9EC;--d-purple-ink:#CECBF6;--d-purple-sub:#AFA9EC;--d-teal-bg:#085041;--d-teal-line:#5DCAA5;--d-teal-ink:#9FE1CB;--d-teal-sub:#5DCAA5;--d-gray-bg:#444441;--d-gray-line:#B4B2A9;--d-gray-ink:#D3D1C7;--d-gray-sub:#B4B2A9;--d-coral-bg:#712B13;--d-coral-line:#F0997B;--d-coral-ink:#F5C4B3;--d-coral-sub:#F0997B;}}
:root[data-theme="dark"]{color-scheme:dark;--paper:#101514;--surface:#182020;--ink:#E4EAE7;--muted:#9AA6A2;--border:#2B3533;--accent:#5DCAA5;--accent-soft:#0F2F27;--code-bg:#1E2726;
--d-line:#B4B2A9;--d-purple-bg:#3C3489;--d-purple-line:#AFA9EC;--d-purple-ink:#CECBF6;--d-purple-sub:#AFA9EC;--d-teal-bg:#085041;--d-teal-line:#5DCAA5;--d-teal-ink:#9FE1CB;--d-teal-sub:#5DCAA5;--d-gray-bg:#444441;--d-gray-line:#B4B2A9;--d-gray-ink:#D3D1C7;--d-gray-sub:#B4B2A9;--d-coral-bg:#712B13;--d-coral-line:#F0997B;--d-coral-ink:#F5C4B3;--d-coral-sub:#F0997B;}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:16px;line-height:1.65;margin:0;padding-inline:16px;padding-block:0 48px}
.wrap{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:1fr;gap:32px}
@media (min-width:960px){.wrap{grid-template-columns:220px minmax(0,1fr)}}
nav.toc{position:sticky;top:env(safe-area-inset-top,0px);align-self:start;padding-block:28px 12px;font-size:14px}
nav.toc ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
nav.toc a{color:var(--muted);text-decoration:none;display:block;padding:4px 10px;border-left:2px solid var(--border)}
nav.toc a:hover,nav.toc a:focus-visible{color:var(--ink);border-left-color:var(--accent);outline:none}
nav.toc .eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px 12px}
@media (max-width:959px){nav.toc{position:static;padding-block:20px 0}nav.toc ol{flex-direction:row;flex-wrap:wrap;gap:6px 10px}nav.toc a{border-left:0;border-bottom:2px solid var(--border);padding:2px 0}}
main{max-width:72ch;padding-block:28px 0;min-width:0}
h1,h2,h3{font-family:"IBM Plex Serif",Georgia,serif;font-weight:500;line-height:1.2;text-wrap:balance;margin:0}
h1{font-size:2.1rem;margin-block:0 16px}
h2{font-size:1.45rem;margin-block:48px 12px;padding-top:16px;border-top:1px solid var(--border)}
h3{font-size:1.1rem;margin-block:24px 8px}
p{margin-block:0 14px}
ul,ol{margin-block:0 14px;padding-left:1.3em}
li{margin-block:4px}
li::marker{color:var(--muted)}
ol li strong{color:var(--accent)}
a{color:var(--accent)}
code{font-family:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:var(--code-bg);padding:.1em .35em;border-radius:3px}
pre{background:var(--code-bg);padding:12px 14px;border-radius:6px;overflow-x:auto;margin-block:0 14px}
pre code{background:none;padding:0;font-size:.85em}
.table{overflow-x:auto;margin-block:0 14px}
table{border-collapse:collapse;width:100%;font-size:.95em}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--border)}
th{font-weight:500;color:var(--muted);font-size:.85em;letter-spacing:.03em;text-transform:uppercase}
tr td:first-child{font-weight:500}
figure.diagram{margin:16px 0 18px;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow-x:auto}
figure.diagram svg{display:block;max-width:100%;height:auto;min-width:420px}
.lede{color:var(--muted);font-size:1.05rem}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
html{scroll-behavior:smooth}
`;

export function buildRollout({ pluginDir }) {
  const src = path.join(pluginDir, 'ROLLOUT.md');
  const md = fs.readFileSync(src, 'utf8');
  const diagrams = (name) => { const f = path.join(pluginDir, 'rollout', 'diagrams', `${name}.svg`); if (!fs.existsSync(f)) throw new Error(`No diagram "${name}" at ${f}`); return fs.readFileSync(f, 'utf8'); };
  const { html, headings } = renderMarkdown(md, { diagrams });
  const body = html.replace(/<h1 id="[^"]+">([^<]+)<\/h1>\n<p>/, (m, t) => `<h1 id="${slug(t)}">${t}</h1>\n<p class="lede">`);
  const page = `<title>Content Ops</title>
<meta name="description" content="How to set up and use Content Ops on any SitecoreAI project">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Serif:wght@500&family=IBM+Plex+Mono&display=swap">
<style>${CSS}</style>
<div class="wrap">
<nav class="toc" aria-label="Sections"><p class="eyebrow">On this page</p><ol>${headings.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol></nav>
<main>
${body}
</main>
</div>
`;
  const out = path.join(pluginDir, 'rollout', 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, page);
  return { out, bytes: Buffer.byteLength(page) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const r = buildRollout({ pluginDir });
  console.log(JSON.stringify(r));
}

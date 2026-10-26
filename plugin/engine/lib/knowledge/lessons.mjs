// Append-only, dated, plain-words lessons (spec 4.7). A lock file notices hand edits so an entry is never
// silently rewritten. `export` bundles what is worth sharing; a person opens the PR.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureKnowledge, knowledgeDir } from './store.mjs';
import { listMappings } from './mappings.mjs';
import { loadRuleOverrides } from './rules.mjs';

const file = (p) => path.join(knowledgeDir(p), 'lessons.md');
const lock = (p) => path.join(knowledgeDir(p), 'lessons.lock');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const FORBIDDEN = [/secret/i, /password/i, /token\s*[=:]/i, /\b[0-9a-f]{32}\b/i, /\{[0-9a-f]{8}-[0-9a-f]{4}-/i];
const NAMES = ['secret', 'password', 'token', 'GUID', 'GUID'];
const APPLIES = { this: 'this client', all: 'likely all projects' };

export function checkLessons(projectDir) {
  const f = file(projectDir);
  if (!fs.existsSync(f)) return { ok: true };
  if (!fs.existsSync(lock(projectDir))) return { ok: false, reason: 'lessons.md exists without lessons.lock; run lessons check --accept' };
  return sha(fs.readFileSync(f, 'utf8')) === fs.readFileSync(lock(projectDir), 'utf8').trim() ? { ok: true } : { ok: false, reason: 'lessons.md was edited by hand since the last add; review it, then run lessons check --accept' };
}
export function acceptLessons(projectDir) { ensureKnowledge(projectDir); const f = file(projectDir); fs.writeFileSync(lock(projectDir), sha(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '') + '\n'); }

export function addLesson(projectDir, { area, title, body, applies = 'this', date = new Date().toISOString().slice(0, 10) }) {
  if (!area || !title || !body) throw new Error('A lesson needs area, title and body');
  if (!(applies in APPLIES)) throw new Error('applies must be "this" or "all"');
  FORBIDDEN.forEach((re, i) => { if (re.test(`${title}\n${body}`)) throw new Error(`Lessons are plain words: no secrets, tokens, passwords or GUIDs (found a ${NAMES[i]})`); });
  const st = checkLessons(projectDir); if (!st.ok) throw new Error(st.reason);
  ensureKnowledge(projectDir);
  const entry = { date, area: area.trim(), title: title.trim().replace(/\s+/g, ' '), body: body.trim(), applies };
  const text = `## ${entry.date} · ${entry.area} · ${entry.title}\n${entry.body}\nApplies to: ${APPLIES[applies]}\n\n`;
  fs.appendFileSync(file(projectDir), text);
  acceptLessons(projectDir);
  return { file: file(projectDir), entry };
}

export function listLessons(projectDir, { last = 20 } = {}) {
  const f = file(projectDir);
  if (!fs.existsSync(f)) return [];
  const out = [];
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/^## (\d{4}-\d{2}-\d{2}) · ([^·\n]+) · (.+)\n([\s\S]*?)\nApplies to: (this client|likely all projects)\n/gm)) out.push({ date: m[1], area: m[2].trim(), title: m[3].trim(), body: m[4].trim(), applies: m[5] === 'likely all projects' ? 'all' : 'this' });
  return out.reverse().slice(0, last);
}

export function exportLessons(projectDir, { project, now = new Date().toISOString().slice(0, 10) }) {
  const all = listLessons(projectDir, { last: Infinity }).filter((l) => l.applies === 'all').reverse();
  const maps = listMappings(projectDir);
  const { rules, sources } = loadRuleOverrides(projectDir);
  const lines = [`# Lessons from ${project} · ${now}`, '', 'Review each item; fold the useful ones into the plugin skills, DEFAULT_RULES or the synonym tables. Nothing here was written to the plugin automatically.', '', '## Lessons marked "likely all projects"', ''];
  for (const l of all) lines.push(`### ${l.date} · ${l.area} · ${l.title}`, l.body, '');
  if (!all.length) lines.push('(none)', '');
  lines.push('## Confirmed sheet shapes (headers only)', '');
  for (const m of maps) { lines.push(`- ${m.tab} from ${m.sourceFile} (${m.provenance}, ${m.confirmedAt?.slice(0, 10)}): ${m.headers.join(', ')}`); for (const [col, e] of Object.entries(m.profile?.columns || {})) if (e.target && e.target !== 'ignore') lines.push(`  - ${col} → ${e.target}`); }
  if (!maps.length) lines.push('(none)');
  lines.push('', '## Rule overrides (candidates for merging)', '');
  for (const [k, v] of Object.entries(rules)) lines.push(`- ${k}: ${JSON.stringify(v)} (${sources[k].provenance}${sources[k].since ? ` since ${sources[k].since}` : ''}${sources[k].why ? `, ${sources[k].why}` : ''})`);
  if (!Object.keys(rules).length) lines.push('(none)');
  const dir = path.join(path.resolve(projectDir), '.content-ops', 'export');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `lessons-${project}-${now}.md`);
  fs.writeFileSync(out, lines.join('\n') + '\n');
  return { file: out, lessons: all.length, mappings: maps.length, rules: Object.keys(rules).length };
}

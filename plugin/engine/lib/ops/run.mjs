// Operations: tools Claude builds for a project when no command fits the ask. An operation lives in
// .content-ops/operations/<name>/ (or ships in the plugin under engine/operations/<name>/):
//   operation.json  { name, description, when, inputs, provenance, version }
//   build.mjs       export default async function build(ctx) → { changeSets, notes? }
//   README.md       what it does, a worked example, what it learned
// build() gets a READ-ONLY Sitecore: every write method throws. It proposes change sets; the engine plans
// them (before-state, fingerprints), and only `apply` writes, with the journal, read-back and undo.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { planChangeSet } from '../items/plan.mjs';
import { newRunDir, writeRun } from '../plan/run.mjs';
import { catalogToSite } from '../catalog/schema.mjs';
import { normId, braced, sameId } from '../cm/ids.mjs';
import { parseLayout, buildLayout, newEntry, placeholderFor, describe, layoutGuards, themesOf } from '../layout/layout.mjs';
import { sameValue } from '../verify/values.mjs';
import { readWorkbook, sheetRecords, sheetColumns, detectLayout } from '../ingest/xlsx.mjs';
import { docxToText } from '../ingest/docx.mjs';
import { htmlToBlocks } from '../ingest/html.mjs';
import { parseCsv } from '../ingest/csv.mjs';

export const BUILTIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'operations');
const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const projectOpsDir = (projectDir) => path.join(projectDir, '.content-ops', 'operations');

export function listOperations(projectDir) {
  const out = [];
  for (const [source, dir] of [['project', projectOpsDir(projectDir)], ['plugin', BUILTIN_DIR]]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      const m = path.join(dir, name, 'operation.json');
      if (!fs.existsSync(m) || out.some((o) => o.name === name)) continue; // a project operation shadows a plugin one
      const man = JSON.parse(fs.readFileSync(m, 'utf8'));
      out.push({ name, source, description: man.description || '', when: man.when || '', version: man.version || 1 });
    }
  }
  return out;
}

export function findOperation(projectDir, name) {
  if (!NAME.test(String(name))) throw new Error(`Operation names are lowercase letters, digits and dashes: "${name}"`);
  for (const [source, dir] of [['project', projectOpsDir(projectDir)], ['plugin', BUILTIN_DIR]]) {
    const d = path.join(dir, name);
    if (fs.existsSync(path.join(d, 'build.mjs'))) {
      const manifest = fs.existsSync(path.join(d, 'operation.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'operation.json'), 'utf8')) : { name };
      return { name, source, dir: d, manifest };
    }
  }
  throw new Error(`No operation "${name}". "content-ops op list" shows the ones this project has; "content-ops op new ${name}" starts one.`);
}

/** The Sitecore an operation's build step sees: reads only. */
export function readOnlyCm(cm) {
  const refuse = (what) => () => { throw new Error(`Operations never write (${what}). Return change sets; the engine applies them.`); };
  return {
    env: cm.env, host: cm.host, isProd: cm.isProd, writable: false, language: cm.language,
    getItem: (q) => cm.getItem(q),
    query: (q, v) => { if (/^\s*mutation\b/i.test(q)) return Promise.reject(new Error('Operations never write (mutation)')); return cm.client ? cm.client.query(q, v) : Promise.reject(new Error('Raw queries need a live client')); },
    createItem: refuse('createItem'), updateItem: refuse('updateItem'), renameItem: refuse('renameItem'), deleteItem: refuse('deleteItem'),
    moveItem: refuse('moveItem'), copyItem: refuse('copyItem'), createItemFromBranch: refuse('createItemFromBranch'), restoreArchivedItem: refuse('restoreArchivedItem'),
  };
}

export async function planOperation({ ctx, name, env, args = {}, cm }) {
  const op = findOperation(ctx.projectDir, name);
  const { project, catalog, rules } = ctx.cfg;
  const read = [];
  const readSource = (rel) => {
    const abs = path.resolve(ctx.projectDir, rel);
    if (path.relative(ctx.projectDir, abs).startsWith('..')) throw new Error(`readSource: ${rel} is outside the project`);
    const buf = fs.readFileSync(abs);
    read.push({ file: path.relative(ctx.projectDir, abs).split(path.sep).join('/'), sha256: crypto.createHash('sha256').update(buf).digest('hex') });
    return buf;
  };
  const notes = [];
  const bctx = {
    env, args, project, catalog, rules, projectDir: ctx.projectDir, cm: readOnlyCm(cm),
    site: catalog ? catalogToSite(catalog) : null,
    readSource, log: (m) => notes.push(String(m)),
    helpers: { ids: { normId, braced, sameId }, layout: { parseLayout, buildLayout, newEntry, placeholderFor, describe, layoutGuards, themesOf }, values: { sameValue },
      xlsx: { readWorkbook, sheetRecords, sheetColumns, detectLayout }, docxToText, htmlToBlocks, parseCsv },
  };
  const mod = await import(pathToFileURL(path.join(op.dir, 'build.mjs')).href + `?t=${Date.now()}-${crypto.randomUUID()}`);
  if (typeof mod.default !== 'function') throw new Error(`${op.dir}/build.mjs must export a default async function build(ctx)`);
  const res = await mod.default(bctx);
  if (!res || !Array.isArray(res.changeSets)) throw new Error(`Operation "${name}" must return { changeSets: [...] }`);
  const keys = new Set();
  for (const cs of res.changeSets) {
    if (!cs || typeof cs.key !== 'string' || !cs.key) throw new Error(`Operation "${name}": every change set needs a string key`);
    if (keys.has(cs.key)) throw new Error(`Operation "${name}": duplicate change set key "${cs.key}"`);
    if (!Array.isArray(cs.ops)) throw new Error(`Operation "${name}": change set "${cs.key}" needs an ops array`);
    keys.add(cs.key);
  }
  const changeSets = [];
  for (const cs of res.changeSets) changeSets.push(await planChangeSet(cm, cs, { siteRoot: project.siteRoot, homePath: project.homePath }));
  const { runId, dir } = newRunDir(ctx.projectDir, env, `op-${name}`);
  const run = { runId, kind: 'items', env, host: cm.host, isProd: !!cm.isProd, createdAt: new Date().toISOString(),
    operation: { name, source: op.source, version: op.manifest.version || 1, args }, sources: read, notes: [...(res.notes || []), ...notes], changeSets };
  const summary = writeRun(dir, run);
  const counts = {}; for (const c of changeSets) counts[c.status] = (counts[c.status] || 0) + 1;
  return { runId, dir, summary, counts, notes: run.notes, needsReview: changeSets.filter((c) => c.status === 'needs-review').map((c) => ({ key: c.key, reasons: c.reasons })) };
}

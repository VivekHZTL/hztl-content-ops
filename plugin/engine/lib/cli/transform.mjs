// `transform --rules <file.json> [--content work/]`: apply named RTE rules to matching fields in work/*.json.
// Every changed field gets a `confirm` flag naming the rule; a log goes to work/transform-log.json.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';
import { stripImages, unwrapAnchors, rewriteHrefs, replaceText } from '../transform/rte.mjs';
import { writeJson } from '../config/project.mjs';

const RULES = { 'strip-images': (v, r) => stripImages(v, r), 'unwrap-anchors': (v, r) => unwrapAnchors(v, r), 'rewrite-hrefs': (v, r) => rewriteHrefs(v, r.rules || [{ match: r.match, replace: r.replace }]), 'replace-text': (v, r) => replaceText(v, r) };

export async function transformCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const rules = JSON.parse(fs.readFileSync(path.resolve(need(flags, 'rules', 'content-ops transform --rules <file.json> [--content work/]')), 'utf8'));
  const dir = path.resolve(ctx.projectDir, flags.content && flags.content !== true ? flags.content : 'work');
  const log = { at: new Date().toISOString(), rules: rules.map((r) => r.rule), files: [] };
  let files = 0, changes = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !['inventory.json', 'transform-log.json'].includes(x) && !x.includes('.proposed.'))) {
    const file = path.join(dir, f);
    let c; try { c = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (!Array.isArray(c.components)) continue;
    const entry = { file: f, changes: [] };
    const apply = (comp, p) => {
      for (const r of rules) {
        const fn = RULES[r.rule]; if (!fn) throw new Error(`Unknown rule "${r.rule}"; known: ${Object.keys(RULES).join(', ')}`);
        if (r.components && !r.components.includes(comp.type)) continue;
        for (const [field, val] of Object.entries(comp.fields || {})) {
          if (typeof val !== 'string' || (r.fields && !r.fields.includes(field))) continue;
          const res = fn(val, r);
          if (res.changes) { comp.fields[field] = res.html; entry.changes.push({ path: `${p}.fields.${field}`, rule: r.rule, count: res.changes }); c.flags.push({ kind: 'confirm', where: c.locators?.[`${p}.fields.${field}`] || `${p}.fields.${field}`, text: `transform ${r.rule}: ${res.changes} change(s); review the diff before apply` }); }
        }
      }
      (comp.children || []).forEach((ch, i) => apply(ch, `${p}.children.${i}`));
    };
    c.flags ||= [];
    c.components.forEach((comp, i) => apply(comp, `components.${i}`));
    if (entry.changes.length) { writeJson(file, c); files++; changes += entry.changes.reduce((a, x) => a + x.count, 0); log.files.push(entry); }
  }
  writeJson(path.join(dir, 'transform-log.json'), log);
  return emit(ctx, { files, changes, log: path.relative(ctx.projectDir, path.join(dir, 'transform-log.json')) });
}

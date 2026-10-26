import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugin = path.join(root, 'plugin');
const read = (f) => fs.readFileSync(f, 'utf8');
const frontmatter = (s) => { const m = s.match(/^---\n([\s\S]*?)\n---/); return m ? Object.fromEntries(m[1].split('\n').filter((l) => /^[a-z-]+:/.test(l)).map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()])) : null; };
const walk = (d, re) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), re) : re.test(e.name) ? [path.join(d, e.name)] : [])) : [];

test('T1: plugin manifest and marketplace parse and agree', () => {
  const pj = JSON.parse(read(path.join(plugin, '.claude-plugin/plugin.json')));
  assert.match(pj.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(pj.version && pj.description && pj.author?.name);
  const mp = JSON.parse(read(path.join(root, '.claude-plugin/marketplace.json')));
  assert.ok(mp.name && mp.owner?.name);
  const entry = mp.plugins.find((p) => p.name === pj.name);
  assert.ok(entry && fs.existsSync(path.join(root, entry.source)));
});
test('T1: claude plugin validate passes when the claude CLI is available', (t) => {
  const which = spawnSync('which', ['claude'], { encoding: 'utf8' });
  if (which.status !== 0) { t.skip('claude CLI not on PATH'); return; }
  const r = spawnSync('claude', ['plugin', 'validate', plugin], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-hook-'));
fs.mkdirSync(path.join(home, '.content-ops'), { recursive: true });
const runHook = (script, input, _unused) => {
  return spawnSync(path.join(plugin, 'scripts', script), [], { input, encoding: 'utf8', env: { ...process.env, CONTENT_OPS_HOME: path.join(home, '.content-ops') } });
};
const cmd = (c) => JSON.stringify({ tool_name: 'Bash', tool_input: { command: c } });
test('T2: safety-guard blocks serialization push for everyone, inside pipelines and sh -c too', () => {
  for (const c of ['dotnet sitecore serialization push', 'cd x && dotnet sitecore ser push -n prod', 'sh -c "dotnet sitecore ser push"']) {
    const r = runHook('safety-guard.sh', cmd(c));
    assert.equal(r.status, 2, `${c}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /serialization push/);
  }
});
test('T2: safety-guard asks on recursive deletes, leaves git alone, ignores non-JSON or non-Bash input', () => {
  for (const c of ['rm -rf node_modules', 'rm -r -f x', 'rm --recursive --force x', 'find . -name "*.tmp" -delete']) assert.equal(JSON.parse(runHook('safety-guard.sh', cmd(c)).stdout).hookSpecificOutput.permissionDecision, 'ask', c);
  for (const c of ['git commit -m x', 'git push origin feat', 'git status && git log -3', 'rm file.txt', 'grep -rn "rm -rf" docs', "echo 'ser push later'"]) { const r = runHook('safety-guard.sh', cmd(c)); assert.equal(r.status, 0, c); assert.equal(r.stdout.trim(), '', c); }
  assert.equal(runHook('safety-guard.sh', 'not json at all').status, 0);
  assert.equal(runHook('safety-guard.sh', JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'x' } })).status, 0);
});
test('T2: write-confirm asks on apply/publish/create/undo and restates env and prod; silent otherwise', () => {
  const r = runHook('write-confirm.sh', cmd('node bin/content-ops.mjs apply --run r1 --confirm production --prod'), 'dev');
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(j.hookSpecificOutput.permissionDecisionReason, /production/);
  assert.match(j.hookSpecificOutput.permissionDecisionReason, /prod: yes/);
  const r2 = runHook('write-confirm.sh', cmd('content-ops apply --run r1'), 'dev');
  assert.match(JSON.parse(r2.stdout).hookSpecificOutput.permissionDecisionReason, /no --confirm/);
  const r3 = runHook('write-confirm.sh', cmd('content-ops plan --env dev --content work/'), 'dev');
  assert.equal(r3.status, 0); assert.equal(r3.stdout.trim(), '');
  assert.equal(runHook('write-confirm.sh', 'garbage', 'dev').status, 0);
});
test('T12: every skill and agent has frontmatter; descriptions fit; hooks reference executable scripts', () => {
  const skills = walk(path.join(plugin, 'skills'), /^SKILL\.md$/);
  const agents = walk(path.join(plugin, 'agents'), /\.md$/);
  assert.ok(skills.length >= 16, `skills found: ${skills.length}`);
  assert.ok(agents.length >= 2);
  for (const f of [...skills, ...agents]) { const fm = frontmatter(read(f)); assert.ok(fm?.name && fm?.description, f); assert.ok(fm.description.length <= 1024, `${f}: description ${fm.description.length} chars`); }
  const hooks = JSON.parse(read(path.join(plugin, 'hooks/hooks.json')));
  for (const h of hooks.hooks.PreToolUse.flatMap((m) => m.hooks)) { const rel = h.command.replace(/^"\$\{CLAUDE_PLUGIN_ROOT\}"\//, ''); const f = path.join(plugin, rel); assert.ok(fs.existsSync(f), f); assert.ok(fs.statSync(f).mode & 0o111, `${f} not executable`); }
});
test('T12: every content-ops command named in the plugin exists in the CLI; no forbidden phrasing; no hosts or GUIDs', () => {
  const bin = read(path.join(root, 'plugin/engine/bin/content-ops.mjs'));
  const known = new Set([...bin.matchAll(/^\s+'?([a-z-]+)'?:\s*(?:run\(|async|\(\))/gm)].map((m) => m[1]));
  const files = walk(plugin, /\.md$/);
  for (const f of files) {
    const s = read(f);
    for (const m of s.matchAll(/content-ops(?:\.mjs)?[ \t]+([a-z][a-z-]+)\b/g)) if (!['the', 'tool', 'plugin', 'skill', 'skills', 'engine', 'command', 'commands', 'repo', 'folder', 'is', 'training', 'and', 'or', 'for'].includes(m[1])) assert.ok(known.has(m[1]), `${path.relative(root, f)}: unknown command "content-ops ${m[1]}"`);
    assert.ok(!/(?<!(?:never|not|n't)\s)(add|pass|append|include)\s+`?--confirm/i.test(s), `${f}: suggests adding --confirm on the user's behalf`);
    assert.ok(!/sitecorecloud\.io|\{[0-9A-F]{8}-[0-9A-F]{4}-/i.test(s), `${f}: host or GUID literal`);
  }
  // commands and flags skills actually run: node <bin> <cmd> --flag …
  const cliDir = path.join(root, 'plugin/engine/lib/cli');
  const flagsOf = {};
  for (const [name, mod] of Object.entries({ check: 'check.mjs', setup: 'setup.mjs', catalog: 'catalog.mjs', sources: 'sources.mjs', plan: 'plan.mjs', show: 'show.mjs', apply: 'apply.mjs', verify: 'verify.mjs', undo: 'undo.mjs', publish: 'publish.mjs', create: 'create.mjs', intake: 'intake.mjs', decide: 'decide.mjs', 'live-check': 'live-check.mjs', snapshot: 'snapshot.mjs', report: 'report.mjs', history: 'history.mjs', export: 'export.mjs', transform: 'transform.mjs', relink: 'relink.mjs', scan: 'scan.mjs', refs: 'refs.mjs', delete: 'delete.mjs', template: 'template.mjs', mappings: 'mappings.mjs', lessons: 'lessons.mjs', rules: 'rules.mjs' })) {
    const src = read(path.join(cliDir, mod));
    flagsOf[name] = new Set([...src.matchAll(/flags(?:\.([A-Za-z-]+)|\['([a-z-]+)'\])/g)].map((m) => m[1] || m[2]).concat([...src.matchAll(/need\(flags, '([a-z-]+)'/g)].map((m) => m[1]), [...src.matchAll(/--([a-z][a-z-]+)/g)].map((m) => m[1])));
  }
  for (const f of files) {
    const s = read(f);
    for (const line of s.split('\n')) for (const m of line.matchAll(/node <bin> ([a-z-]+)((?:\s+[^\s`|]+)*)/g)) {
      assert.ok(known.has(m[1]), `${path.relative(root, f)}: unknown command "node <bin> ${m[1]}"`);
      for (const fl of m[2].matchAll(/--([a-z-]+)/g)) assert.ok(flagsOf[m[1]]?.has(fl[1]), `${path.relative(root, f)}: "${m[1]}" has no flag --${fl[1]}`);
    }
  }
  const extractor = read(path.join(plugin, 'agents/deck-extractor.md'));
  assert.match(extractor, /sensitive/); assert.match(extractor, /passcode/i);
});

test('F1: write-confirm asks on setup --from-env-local (writes outside the repo) and stays silent on file-only commands', () => {
  const r = runHook('write-confirm.sh', cmd('node bin/content-ops.mjs setup --from-env-local headapps/x/.env.local --env dev'), 'dev');
  const j = JSON.parse(r.stdout);
  assert.equal(j.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(j.hookSpecificOutput.permissionDecisionReason, /credentials/i);
  assert.match(j.hookSpecificOutput.permissionDecisionReason, /dev/);
  for (const c of ['content-ops template --page-type x', 'content-ops lessons add --area a --title t --body b', 'content-ops mappings list', 'content-ops rules list', 'content-ops catalog refresh --env dev', 'content-ops setup --answers a.json']) {
    const s = runHook('write-confirm.sh', cmd(c), 'dev'); assert.equal(s.stdout.trim(), '', c);
  }
});
test('F1: new skills exist; the router mentions lessons, template, mappings and contacts; client names are checked repo-wide by no-client-data.test', () => {
  for (const s of ['content-ops-template', 'content-ops-lessons']) assert.ok(fs.existsSync(path.join(plugin, 'skills', s, 'SKILL.md')), s);
  const router = read(path.join(plugin, 'skills/content-ops/SKILL.md'));
  for (const w of ['lessons list', 'content-ops-template', 'content-ops-lessons', 'contacts']) assert.match(router, new RegExp(w));
  assert.doesNotMatch(router, /\.content-ops\/learnings/);
  assert.match(read(path.join(plugin, 'README.md')), /ROLLOUT\.md/);
  assert.ok(fs.existsSync(path.join(plugin, 'rollout/index.html')), 'built rollout page');
  const setup = read(path.join(plugin, 'skills/content-ops-setup/SKILL.md'));
  assert.match(setup, /--from-env-local/); assert.match(setup, /catalog refresh/);
  for (const f of walk(plugin, /\.md$/)) { const s = read(f); assert.doesNotMatch(s, /training level 5/, f); }
});

test('F3: training v2 files exist, the run-sheet has eight complete blocks, levels are reference only', () => {
  const tr = path.join(plugin, 'training');
  for (const f of ['00-before-the-session.md', 'START-HERE.md', 'session-run-sheet.md', 'take-home-card.md', 'README.md']) assert.ok(fs.existsSync(path.join(tr, f)), f);
  const sheet = read(path.join(tr, 'session-run-sheet.md'));
  const blocks = sheet.split(/^## \d\. /m).slice(1);
  assert.equal(blocks.length, 8);
  for (const b of blocks) for (const w of ['You type', 'Expected', 'If it differs', 'Do:', "Don't:", 'Slides']) assert.ok(b.includes(w), w);
  assert.match(read(path.join(tr, 'take-home-card.md')), /contacts/);
  assert.ok(fs.existsSync(path.join(tr, 'reference')) && fs.readdirSync(path.join(tr, 'reference')).length >= 3);
  assert.equal(fs.readdirSync(tr).filter((f) => /level-/.test(f)).length, 0, 'no level files at the training root');
  assert.match(read(path.join(tr, 'README.md')), /00-before-the-session/);
});

test('R-F3: training text matches the engine; deck source stays inside the Slides format', () => {
  const tr = path.join(plugin, 'training');
  const sheet = read(path.join(tr, 'session-run-sheet.md'));
  assert.doesNotMatch(sheet, /undo command/); assert.doesNotMatch(sheet, /report --combined/); assert.match(sheet, /existing/);
  assert.match(sheet, /mappedExact\` equals the column count\./);
  assert.doesNotMatch(read(path.join(tr, 'take-home-card.md')), /read-back|reads back/);
  for (const f of walk(path.join(tr, 'deck/project/slides'), /\.html$/)) {
    const s = read(f);
    assert.doesNotMatch(s, /<(p|h1|h2|h3)[^>]*max-width/, f);
    assert.doesNotMatch(s, /<b style/, f);
    assert.doesNotMatch(s, /undo command/, f);
  }
  const readme = read('/Users/viveksatikunvar/Projects/AH-SitecoreXMC/docs/content-ops-training/README.md');
  assert.doesNotMatch(readme, /six levels\. You do them in order|then reference\/01-level-0/i);
});

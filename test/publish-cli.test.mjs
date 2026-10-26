import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { publishCommand } from '../plugin/engine/lib/cli/publish.mjs';

const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-pub-'));
test.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));
const H = '/sitecore/content/DemoSite/Demo/Home';
const items = { p1: { id: 'a'.repeat(32), path: `${H}/x` }, ds: { id: 'b'.repeat(32), path: `${H}/x/Data/RTE` }, out: { id: 'c'.repeat(32), path: '/sitecore/content/Other/y' } };
function fakeCmFactory(calls) {
  return () => ({ env: 'fake', isProd: false, writable: true, host: 'fake.local',
    async getItem({ id }) { return Object.values(items).find((x) => x.id === id) || null; },
    client: { env: 'fake', isProd: false, writable: true,
      async mutate(q, vars) { calls.push(['mutate', vars]); return { publishItem: { operationId: 'op1' } }; },
      async query() { return { publishingStatus: { isDone: true, isFailed: false, state: 'Complete', processed: 2 } }; } } });
}
async function project(journal) {
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: H, environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json'), '--force'], { projectDir, print: false });
  const runDir = path.join(projectDir, 'runs', 'r1_fake_plan'); fs.mkdirSync(path.join(runDir, 'journal'), { recursive: true });
  writeJson(path.join(runDir, 'plan.json'), { runId: 'r1_fake_plan', env: 'fake', pages: [], sources: [], createdAt: new Date().toISOString() });
  writeJson(path.join(runDir, 'journal', 'a1_k.json'), journal);
}
test('publish --dry lists roots from done journals and makes no call; real run publishes page + created + updated', async () => {
  await project({ key: 'k', itemId: items.p1.id, env: 'fake', applyId: 'a1', status: 'done', steps: [{ op: 'create', id: items.ds.id, name: 'RTE', state: 'done' }, { op: 'update', id: items.p1.id, fields: [], state: 'done' }] });
  const calls = [];
  const dry = await publishCommand(['--run', 'r1_fake_plan', '--confirm', 'fake', '--dry'], { projectDir, cmFactory: fakeCmFactory(calls), print: false });
  assert.equal(dry.roots.length, 2); assert.equal(calls.length, 0);
  const out = await publishCommand(['--run', 'r1_fake_plan', '--confirm', 'fake'], { projectDir, cmFactory: fakeCmFactory(calls), print: false });
  assert.equal(out.ops, 1); assert.equal(calls[0][1].i.rootItemIds.length, 2);
  assert.ok(fs.readdirSync(path.join(projectDir, 'runs', 'r1_fake_plan')).some((f) => /^publish-.*\.json$/.test(f)));
});
test('publish refuses a root outside homePath by path, before any call', async () => {
  await project({ key: 'k', itemId: items.out.id, env: 'fake', applyId: 'a1', status: 'done', steps: [] });
  const calls = [];
  await assert.rejects(publishCommand(['--run', 'r1_fake_plan', '--confirm', 'fake'], { projectDir, cmFactory: fakeCmFactory(calls), print: false }), /Other\/y/);
  assert.equal(calls.length, 0);
});

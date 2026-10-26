import test from 'node:test';
import assert from 'node:assert/strict';
import { publishItems } from '../plugin/engine/lib/publish/publish.mjs';

function fakeClient(statuses) {
  const calls = [];
  return { calls, env: 'dev', isProd: false, writable: true,
    async mutate(q, vars) { calls.push(['mutate', vars]); return { publishItem: { operationId: `op${calls.length}` } }; },
    async query(q, vars) { calls.push(['query', vars]); return { publishingStatus: statuses.shift() }; } };
}
const sleep = async () => {};
test('publishes in batches, polls to done, logs each op', async () => {
  const client = fakeClient([{ isDone: false, isFailed: false, state: 'Running', processed: 0 }, { isDone: true, isFailed: false, state: 'Complete', processed: 2 }, { isDone: true, isFailed: false, state: 'Complete', processed: 1 }]);
  const items = [{ id: 'a'.repeat(32), path: '/s/Home/x/Data/1' }, { id: 'b'.repeat(32), path: '/s/Home/x/Data/2' }, { id: 'c'.repeat(32), path: '/s/Home/y/Data/3' }];
  const log = await publishItems({ client, items, scope: (i) => /\/Data\//.test(i.path), confirm: 'dev', batchSize: 2, sleep });
  assert.equal(log.ops.length, 2);
  assert.equal(client.calls[0][1].i.publishSubItems, false);
  assert.equal(client.calls[0][1].i.targetDatabases[0], 'experienceedge');
  assert.equal(client.calls[0][1].i.rootItemIds.length, 2);
  assert.equal(log.ops[0].status.state, 'Complete');
});
test('refuses out-of-scope items before any call and stops on a failed op', async () => {
  const client = fakeClient([{ isDone: true, isFailed: true, state: 'Failed', processed: 0 }]);
  await assert.rejects(publishItems({ client, items: [{ id: 'a'.repeat(32), path: '/nope' }], scope: (i) => /\/Data\//.test(i.path), confirm: 'dev', sleep }), /out of scope/);
  assert.equal(client.calls.length, 0);
  await assert.rejects(publishItems({ client, items: [{ id: 'a'.repeat(32), path: '/s/Data/1' }], scope: () => true, confirm: 'dev', sleep }), /publish operation failed/);
  await assert.rejects(publishItems({ client, items: [], scope: () => true, confirm: 'dev', sleep }), /nothing to publish/);
});

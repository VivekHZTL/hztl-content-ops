// Guarded publish runner. Takes an explicit item list (normally derived from apply journals), refuses
// anything the scope predicate rejects BEFORE the first call, publishes in batches, polls each
// operation to completion, and stops on the first failed operation. Needs a client created with
// { allowWrites: true, allowPublish: true }.
import { braced } from '../cm/ids.mjs';
import { assertWritable } from '../apply/guards.mjs';

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const MUT = 'mutation($i:PublishItemInput!){ publishItem(input:$i){ operationId } }';
const STATUS = 'query($id:String!){ publishingStatus(publishingOperationId:$id){ isDone isFailed processed state } }';

export async function publishItems({ client, items, scope, confirm, prod = false, batchSize = 40, subItems = false, related = false, mode = 'SMART', languages = ['en'], target = 'experienceedge', pollMs = 5000, maxPolls = 120, sleep = wait, onOp = () => {} }) {
  if (typeof scope !== 'function') throw new Error('publishItems needs a scope(item) function that says which items may be published');
  assertWritable(client, { confirm, prod });
  if (!items?.length) throw new Error('nothing to publish');
  const bad = items.filter((x) => !scope(x));
  if (bad.length) throw new Error(`out of scope: ${bad.map((x) => x.path || x.id).join(', ')}`);
  const log = { startedAt: new Date().toISOString(), ops: [] };
  for (let i = 0; i < items.length; i += batchSize) {
    const part = items.slice(i, i + batchSize);
    const d = await client.mutate(MUT, { i: { rootItemIds: part.map((x) => braced(x.id)), publishSubItems: subItems, publishRelatedItems: related, publishItemMode: mode, languages, targetDatabases: [target] } });
    const op = { operationId: d.publishItem.operationId, items: part.map((x) => x.path || x.id), status: null };
    log.ops.push(op);
    for (let t = 0; t < maxPolls; t++) {
      op.status = (await client.query(STATUS, { id: op.operationId })).publishingStatus;
      if (op.status?.isDone || op.status?.isFailed) break;
      await sleep(pollMs);
    }
    onOp(op);
    if (!op.status?.isDone && !op.status?.isFailed) { log.finishedAt = new Date().toISOString(); throw Object.assign(new Error(`publish operation ${op.operationId} did not finish within ${maxPolls} polls; stopped`), { log }); }
    if (op.status?.isFailed) { log.finishedAt = new Date().toISOString(); throw Object.assign(new Error('publish operation failed; stopped'), { log }); }
  }
  log.finishedAt = new Date().toISOString();
  return log;
}

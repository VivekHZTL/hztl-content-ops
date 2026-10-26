// Manual rollback of a page that finished "done", from its journal. Strict: only fields that still
// hold the values the run wrote are restored; anything edited since is left alone and reported.
// Refuses a journal from another environment or one that is not in status "done".
import fs from 'node:fs';
import path from 'node:path';
import { rollbackJournal } from './journal.mjs';

const readJournal = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export async function rollbackPage({ cm, runDir, applyId, key }) {
  const dir = path.join(runDir, 'journal');
  const file = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => f.startsWith(applyId + '_') && f.endsWith('.json') && readJournal(path.join(dir, f))?.key === key);
  if (!file) throw new Error('No journal for that page');
  const j = readJournal(path.join(dir, file));
  if (j.env && cm.env && j.env !== cm.env) throw new Error(`Journal is for environment "${j.env}", client is "${cm.env}"`);
  if (j.status && j.status !== 'done') throw new Error(`Journal status is "${j.status}"; only a "done" page can be undone`);
  const problems = await rollbackJournal(cm, j, { strict: true });
  j.manualRollback = { at: new Date().toISOString(), problems };
  fs.writeFileSync(path.join(dir, file) + '.tmp', JSON.stringify(j, null, 1)); fs.renameSync(path.join(dir, file) + '.tmp', path.join(dir, file));
  return problems;
}

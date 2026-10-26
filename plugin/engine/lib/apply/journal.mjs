// Write-ahead journal and rollback.
// Every step record is saved to the journal file with state "started" BEFORE its write runs, and
// "done" after. rollbackJournal() walks the steps in reverse: renames back, restores field values
// (resetting fields that came from standard values), moves items back, restores deleted items from the
// recycle bin, and moves created or copied items to the recycle bin.
// strict: a field that no longer holds the value the run wrote is left alone and reported.
import fs from 'node:fs';
import { exactValue } from '../verify/values.mjs';

export function journalWriter(file, base) {
  const j = { ...base, file, startedAt: new Date().toISOString(), steps: [] };
  // Atomic: a crash mid-save must never leave a truncated journal, which would break undo for the whole run.
  const save = () => { fs.writeFileSync(file + '.tmp', JSON.stringify(j, null, 1)); fs.renameSync(file + '.tmp', file); };
  save();
  return {
    j,
    async step(rec, fn) { rec.state = 'started'; j.steps.push(rec); save(); const out = await fn(); rec.state = 'done'; save(); return out; },
    finish(status, extra = {}) { Object.assign(j, { status, finishedAt: new Date().toISOString(), ...extra }); save(); },
  };
}

export async function rollbackJournal(cm, j, { strict = false } = {}) {
  const problems = [];
  let leftAlone = 0;
  for (const s of [...j.steps].reverse()) {
    if (!s.state) continue;
    try {
      if (s.op === 'rename') {
        const cur = await cm.getItem({ id: s.id });
        if (cur && cur.name !== s.from && (!strict || cur.name === s.to)) await cm.renameItem({ id: s.id, newName: s.from });
        else if (strict && cur && cur.name !== s.to && cur.name !== s.from) problems.push(`Name changed since run (${cur.name}); not renamed back`);
      } else if (s.op === 'update') {
        const cur = await cm.getItem({ id: s.id });
        if (!cur) { problems.push(`Item ${s.id} no longer exists`); continue; }
        const fields = [];
        for (const f of s.fields) {
          const now = cur.fields[f.name]?.value;
          if (exactValue(now, f.from ?? '') && !exactValue(f.from ?? '', f.to)) continue; // already restored
          if (strict && !exactValue(now, f.to)) { problems.push(`${f.name} changed since run; left as is`); leftAlone++; continue; }
          fields.push(f.std ? { name: f.name, reset: true } : { name: f.name, value: f.from ?? '' });
        }
        if (fields.length) await cm.updateItem({ id: s.id, fields });
      } else if (s.op === 'move') {
        const cur = await cm.getItem({ id: s.id });
        if (!cur) { problems.push(`Moved item ${s.id} no longer exists`); continue; }
        if (cur.parentId === s.fromParentId) continue;
        if (strict && cur.parentId !== s.toParentId) { problems.push(`${cur.path} was moved again since the run; not moved back`); continue; }
        await cm.moveItem({ id: s.id, toParentId: s.fromParentId });
      } else if (s.op === 'delete') {
        if (await cm.getItem({ id: s.id })) continue;
        await cm.restoreArchivedItem({ id: s.id });
      } else if (s.op === 'create' || s.op === 'copy') {
        // Steps run in reverse, so every update of this page has already been examined. If any field was left
        // alone, a layout or multilist may still point at the created item: keep it rather than break the page.
        if (strict && leftAlone) { problems.push(`Created item ${s.name} kept: ${leftAlone} field(s) changed since run may still reference it`); continue; }
        let id = s.id;
        if (!id) { const parent = await cm.getItem({ id: s.parentId }); id = parent?.children.find((c) => c.name === s.name && !(s.preexisting || []).includes(c.id))?.id; }
        if (id && await cm.getItem({ id })) await cm.deleteItem({ id }); // already gone: nothing to undo
      }
    } catch (e) { problems.push(`${s.op} ${s.name || s.field || s.id}: ${e.message}`); }
  }
  return problems;
}

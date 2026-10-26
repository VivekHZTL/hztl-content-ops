// `lessons add --area a --title t --body b [--applies this|all]` | `lessons list [--last n]` | `lessons check [--accept]` | `lessons export`
import { parseArgs } from './args.mjs';
import { context, emit } from './common.mjs';
import { addLesson, listLessons, checkLessons, acceptLessons, exportLessons } from '../knowledge/lessons.mjs';

const str = (flags, k) => (flags[k] && flags[k] !== true ? String(flags[k]) : null);
export async function lessonsCommand(argv, deps = {}) {
  const { _, flags } = parseArgs(argv);
  const ctx = context(deps);
  if (_[0] === 'add') {
    for (const k of ['area', 'title', 'body']) if (!str(flags, k)) throw new Error(`lessons add needs --${k}`);
    return emit(ctx, addLesson(ctx.projectDir, { area: str(flags, 'area'), title: str(flags, 'title'), body: str(flags, 'body'), applies: str(flags, 'applies') || 'this' }));
  }
  if (_[0] === 'list') return emit(ctx, { lessons: listLessons(ctx.projectDir, { last: +(str(flags, 'last') || 20) }) });
  if (_[0] === 'check') { if (flags.accept) acceptLessons(ctx.projectDir); return emit(ctx, checkLessons(ctx.projectDir)); }
  if (_[0] === 'export') return emit(ctx, exportLessons(ctx.projectDir, { project: ctx.cfg.project.name }));
  throw new Error('usage: content-ops lessons add --area a --title t --body b [--applies this|all] | lessons list [--last n] | lessons check [--accept] | lessons export');
}

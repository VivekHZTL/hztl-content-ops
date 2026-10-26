import test from 'node:test';
import assert from 'node:assert/strict';
import { solveThemes } from '../plugin/engine/lib/plan/themes.mjs';
const alternate = ['ThemesWhite', 'ThemesLight'];
test('alternates free units and respects fixed ones', () => {
  assert.deepEqual(solveThemes([{}, {}, {}, {}], { alternate }), ['ThemesWhite', 'ThemesLight', 'ThemesWhite', 'ThemesLight']);
  assert.deepEqual(solveThemes([{}, { fixed: 'ThemesWhite' }, {}], { alternate }), ['ThemesLight', 'ThemesWhite', 'ThemesLight']);
  assert.deepEqual(solveThemes([], { alternate }), []);
});

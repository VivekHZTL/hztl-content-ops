import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLayout, buildLayout, newEntry, placeholderFor, readTheme, withTheme, describe, layoutGuards } from '../plugin/engine/lib/layout/layout.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const snap0 = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/page-snapshot.json'), 'utf8'));
const xml = snap0.page.fields['__Final Renderings'].value;
const device = xml.match(/<d\s[^>]*id="([^"]+)"/)[1];
const ids = [...new Set([...xml.matchAll(/s:id="\{([^}]+)\}"/g)].map((m) => m[1].toUpperCase()))];
const site = { device, placeholders: { hero: '/headless-main/hero', main: '/headless-main/main' },
  components: Object.fromEntries(ids.map((id, i) => [`c${i}`, { name: `Component ${i}`, renderingId: id, ph: i === 0 ? 'hero' : 'main' }])) };
site.components.accordion = { name: 'Accordion', renderingId: 'AAAAAAAA-1111-1111-1111-111111111111', ph: 'main' };
site.components.panel = { name: 'Accordion panel', renderingId: 'BBBBBBBB-1111-1111-1111-111111111111', ph: 'accordion' };

test('parseLayout maps renderings to catalog keys and reads dynamic ids', () => {
  const { devices, entries } = parseLayout(xml, site);
  assert.deepEqual(devices, [device.toUpperCase()]);
  assert.ok(entries.length > 2);
  assert.ok(entries.every((e) => e.key));
  assert.ok(entries.some((e) => Number.isInteger(e.dynId)));
});
test('buildLayout keeps entries byte-for-byte except positions, chained in order', () => {
  const { entries } = parseLayout(xml, site);
  const reordered = [entries[0], entries[2], entries[1]];
  const out = parseLayout(buildLayout(reordered, site), site);
  assert.deepEqual(out.entries.map((e) => e.uid), reordered.map((e) => e.uid));
  assert.match(out.entries[0].raw, /p:before="\*"/);
  assert.ok(out.entries[1].raw.includes(`p:after="r[@uid='${reordered[0].uid}']"`));
  assert.equal(out.entries[1].ds, entries[2].ds);
});
test('new entries get a placeholder from the catalog and a theme', () => {
  const e = newEntry({ key: 'accordion', ds: 'local:/Data/Accordion', ph: placeholderFor('accordion', null, site), dynId: 7 }, site);
  const kid = newEntry({ key: 'panel', ds: 'local:/Data/Accordion/Item 1', ph: placeholderFor('panel', 7, site), dynId: 8 }, site);
  assert.equal(e.ph, '/headless-main/main');
  assert.equal(kid.ph, '/headless-main/main/accordion-7');
  const out = parseLayout(buildLayout([{ ...e, wantTheme: 'ThemesLight' }, kid], site), site);
  assert.equal(out.entries[0].theme, 'ThemesLight');
  assert.equal(out.entries[1].key, 'panel');
});
test('readTheme flags duplicates and withTheme sets exactly one', () => {
  assert.equal(readTheme('a=1&selectTheme=ThemesWhite&selectTheme=ThemesLight'), '!ThemesWhite|ThemesLight');
  assert.equal(readTheme('selectTheme=,ThemesWhite'), '!,ThemesWhite');
  assert.equal(withTheme('a=1&selectTheme=x&selectTheme=y', 'ThemesLight'), 'a=1&selectTheme=ThemesLight');
});
test('describe names unknown renderings and layoutGuards reports them', () => {
  const unknown = xml.replace(/s:id="\{[^}]+\}"/, 's:id="{CCCCCCCC-1111-1111-1111-111111111111}"');
  const { entries } = parseLayout(unknown, site);
  assert.ok(describe(entries, site).some((s) => /Unknown rendering \{CCCCCCCC/.test(s)));
  assert.ok(layoutGuards(unknown, '', site).some((r) => /unknown rendering/i.test(r)));
  assert.ok(layoutGuards(xml, '<r><d id="x"><r s:id="{A}"/></d></r>', site).some((r) => /shared layout/i.test(r)));
  assert.ok(layoutGuards(xml + xml, '', site).some((r) => /device/i.test(r)));
});

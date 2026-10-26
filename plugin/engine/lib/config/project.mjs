// Project configuration: <project>/.content-ops/{project,rules,catalog,decisions,overrides}.json
import fs from 'node:fs';
import path from 'node:path';
import { loadRuleOverrides, effectiveRules } from '../knowledge/rules.mjs';

export const DEFAULT_RULES = {
  language: 'en',
  dataFolder: 'Data',
  themes: { alternate: ['ThemesWhite', 'ThemesLight'], pinned: {} },
  placeholders: ['[TBD]', '[insert', 'TBD', 'lorem', 'XX'],
  removeMissingComponents: false,
  newTab: { external: true, internal: false, files: true },
  planMaxAgeHours: 12,
};

export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

export function validateProject(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return ['project.json is not an object'];
  for (const k of ['name', 'siteRoot', 'homePath']) if (!p[k] || typeof p[k] !== 'string') errors.push(`project.${k} is required (string)`);
  if (!Array.isArray(p.environments) || !p.environments.length) errors.push('project.environments is required (array with at least one { name })');
  else p.environments.forEach((e, i) => { if (!e?.name) errors.push(`project.environments[${i}].name is required`); });
  if (p.placeholders && typeof p.placeholders !== 'object') errors.push('project.placeholders must be an object { hero?, main? }');
  if (p.contacts !== undefined && (typeof p.contacts !== 'object' || p.contacts === null || Array.isArray(p.contacts) || Object.values(p.contacts).some((v) => typeof v !== 'string'))) errors.push('project.contacts must be an object of names, e.g. { "dev": "<name>", "content": "<name>" }');
  return errors;
}

export function loadProject(projectDir) {
  const dir = path.resolve(projectDir);
  const cfgDir = path.join(dir, '.content-ops');
  const projectFile = path.join(cfgDir, 'project.json');
  if (!fs.existsSync(projectFile)) throw new Error(`No ${projectFile}. Run "content-ops setup --answers <file>" first.`);
  const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  const errors = validateProject(project);
  if (errors.length) throw new Error(`Invalid project.json:\n- ${errors.join('\n- ')}`);
  project.blueprintRoot ||= `${project.homePath.replace(/\/$/, '')}/_blueprints`;
  const { rules, sources: ruleSources } = effectiveRules(DEFAULT_RULES, loadRuleOverrides(dir));
  return {
    dir, cfgDir, project, rules, ruleSources,
    catalog: readJson(path.join(cfgDir, 'catalog.json'), null),
    decisions: readJson(path.join(cfgDir, 'decisions.json'), []),
    overrides: readJson(path.join(cfgDir, 'overrides.json'), {}),
  };
}

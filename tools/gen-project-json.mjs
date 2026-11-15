#!/usr/bin/env node
/*
 * Generates project.json from js/properties.js.
 *
 *   node tools/gen-project-json.mjs          # write project.json
 *   node tools/gen-project-json.mjs --check  # exit 1 if project.json is stale
 *
 * Keeping the generator around means the Wallpaper Engine property panel and
 * the wallpaper runtime can never disagree about defaults, ranges or options.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);
const meta = require(join(root, 'js', 'properties.js'));

const SUPPORTED = new Set(['combo', 'color', 'slider', 'bool', 'textinput']);
const problems = [];

function check(condition, message) {
  if (!condition) problems.push(message);
}

check(meta && meta.project, 'js/properties.js must export `project`');
check(meta && Array.isArray(meta.properties) && meta.properties.length > 0, 'needs at least one property');

const seen = new Set();
const projectProperties = {};

(meta.properties || []).forEach((property, index) => {
  const key = property.key;
  check(typeof key === 'string' && /^[A-Za-z0-9]+$/.test(key), `invalid property key: ${key}`);
  check(!seen.has(key), `duplicate property key: ${key}`);
  seen.add(key);
  check(SUPPORTED.has(property.type), `unsupported type for ${key}: ${property.type}`);
  check(typeof property.text === 'string' && property.text.length > 0, `${key} needs a label`);
  check(property.value !== undefined, `${key} needs a default value`);

  if (property.type === 'combo') {
    check(Array.isArray(property.options) && property.options.length > 0, `${key} needs options`);
    const values = (property.options || []).map((option) => option.value);
    check(values.includes(property.value), `${key} default must be one of its options`);
  }

  if (property.type === 'slider') {
    check(typeof property.min === 'number' && typeof property.max === 'number', `${key} needs min/max`);
    check(property.min < property.max, `${key} min must be below max`);
    check(
      typeof property.value === 'number' && property.value >= property.min && property.value <= property.max,
      `${key} default must be inside its range`
    );
  }

  if (property.type === 'color') {
    check(
      typeof property.value === 'string' && /^\d*\.?\d+( \d*\.?\d+){2}$/.test(property.value),
      `${key} color must look like "0.2 1 0.53"`
    );
  }

  if (property.type === 'bool') {
    check(typeof property.value === 'boolean', `${key} default must be a boolean`);
  }

  const output = {
    order: (index + 1) * 10,
    text: property.text,
    type: property.type.replace('textinput', 'textinput'),
    value: property.value
  };

  if (property.type === 'slider') {
    output.min = property.min;
    output.max = property.max;
    output.editable = true;
  }

  if (property.type === 'combo') {
    output.options = property.options.map((option) => ({
      value: option.value,
      label: option.label
    }));
  }

  if (property.condition) output.condition = property.condition;

  projectProperties[key] = output;
});

if (problems.length > 0) {
  console.error('js/properties.js is invalid:');
  for (const problem of problems) console.error('  - ' + problem);
  process.exit(1);
}

const project = {
  title: meta.project.title,
  description: meta.project.description,
  file: meta.project.file || 'index.html',
  preview: meta.project.preview || 'preview.jpg',
  type: 'web',
  contentrating: meta.project.contentrating || 'Everyone',
  general: {
    supportsaudioprocessing: !!meta.supportsAudioProcessing,
    properties: projectProperties
  }
};

const outputPath = join(root, 'project.json');
const json = JSON.stringify(project, null, '\t') + '\n';

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(outputPath, 'utf8');
  } catch {
    current = '';
  }
  if (current !== json) {
    console.error('project.json is out of date — run `npm run gen`');
    process.exit(1);
  }
  console.log('project.json is up to date');
  process.exit(0);
}

writeFileSync(outputPath, json, 'utf8');
console.log(`wrote project.json (${meta.properties.length} properties)`);

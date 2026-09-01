#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

const [input, output, ...clipNames] = process.argv.slice(2);
if (!input || !output || clipNames.length === 0) {
  console.error('Usage: node prune_gltf_animations.mjs input.gltf output.gltf Clip_A Clip_B ...');
  process.exit(1);
}

const document = JSON.parse(await readFile(input, 'utf8'));
const requested = new Set(clipNames);
const available = new Set((document.animations ?? []).map((animation) => animation.name));
const missing = clipNames.filter((name) => !available.has(name));
if (missing.length) {
  console.error(`Missing clips: ${missing.join(', ')}`);
  process.exit(2);
}

document.animations = document.animations.filter((animation) => requested.has(animation.name));
await writeFile(output, `${JSON.stringify(document)}\n`);
console.log(`Kept ${document.animations.length} clips: ${document.animations.map((animation) => animation.name).join(', ')}`);

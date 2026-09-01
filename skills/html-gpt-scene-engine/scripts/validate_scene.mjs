#!/usr/bin/env node
import fs from 'node:fs';

const [path] = process.argv.slice(2);
if (!path) {
  console.error('Usage: node validate_scene.mjs <scene.json>');
  process.exit(2);
}
const scene = JSON.parse(fs.readFileSync(path, 'utf8'));
const errors = [];
const assetIds = new Set((scene.assets ?? []).map((asset) => asset.id));
const floorIds = new Set((scene.floors ?? []).map((floor) => floor.id));

if (scene.version !== 1) errors.push('scene.version must currently be 1');
if (!scene.world?.pixelsPerMeter) errors.push('world.pixelsPerMeter is required');
if (!scene.styleLock?.projection) errors.push('styleLock.projection is required');
if (!Array.isArray(scene.floors) || scene.floors.length === 0) errors.push('at least one floor is required');

for (const floor of scene.floors ?? []) {
  for (const room of floor.rooms ?? []) {
    if (!assetIds.has(room.floorAsset)) errors.push(`${floor.id}/${room.id}: missing floor asset ${room.floorAsset}`);
  }
  for (const item of floor.doors ?? []) {
    if (!assetIds.has(item.frontAsset)) errors.push(`${floor.id}/${item.id}: missing front asset ${item.frontAsset}`);
    if (!assetIds.has(item.backAsset)) errors.push(`${floor.id}/${item.id}: missing back asset ${item.backAsset}`);
    if (!(item.minAngle <= item.closedAngle && item.closedAngle <= item.maxAngle)) errors.push(`${floor.id}/${item.id}: closedAngle is outside limits`);
  }
  for (const actor of floor.occupants ?? []) {
    if (!assetIds.has(actor.asset)) errors.push(`${floor.id}/${actor.id}: missing actor asset ${actor.asset}`);
  }
  for (const target of [floor.stairs?.toUp, floor.stairs?.toDown].filter(Boolean)) {
    if (!floorIds.has(target)) errors.push(`${floor.id}: stair destination ${target} does not exist`);
  }
}

if (errors.length) {
  console.error(`FAIL: ${errors.length} scene issue(s)`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`OK: ${scene.name ?? path} has ${scene.floors.length} floor(s), ${assetIds.size} asset(s), and valid cross-references.`);

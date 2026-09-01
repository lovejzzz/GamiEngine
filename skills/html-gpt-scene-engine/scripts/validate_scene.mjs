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

if (scene.version !== 2) errors.push('scene.version must currently be 2');
if (!scene.world?.pixelsPerMeter) errors.push('world.pixelsPerMeter is required');
if (!['2d', '3d'].includes(scene.renderer?.mode)) errors.push('renderer.mode must be 2d or 3d');
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
  for (const prop of floor.props ?? []) {
    if (!assetIds.has(prop.asset)) errors.push(`${floor.id}/${prop.id}: missing prop asset ${prop.asset}`);
    const partIds = new Set();
    for (const part of prop.parts ?? []) {
      if (partIds.has(part.id)) errors.push(`${floor.id}/${prop.id}: duplicate child part ${part.id}`);
      partIds.add(part.id);
      if (!part.interaction?.defaultState) errors.push(`${floor.id}/${prop.id}/${part.id}: interaction defaultState is required`);
    }
  }
  for (const target of [floor.stairs?.toUp, floor.stairs?.toDown].filter(Boolean)) {
    if (!floorIds.has(target)) errors.push(`${floor.id}: stair destination ${target} does not exist`);
  }
}

for (const asset of scene.assets ?? []) {
  if (asset.usage === 'reference-study') {
    if (asset.referenceStudy?.runtimeRule !== 'never-render-directly') errors.push(`${asset.id}: reference study must declare never-render-directly`);
    if (!asset.geometry?.source) errors.push(`${asset.id}: reference study needs a geometry plan`);
  }
  if (asset.usage === 'runtime-texture') {
    if (!asset.texture && asset.state === 'ready') errors.push(`${asset.id}: ready runtime texture needs texture metadata`);
    if (asset.texture && !asset.texture.metersPerTile) errors.push(`${asset.id}: runtime texture needs metersPerTile`);
  }
  if (!asset.interaction) continue;
  const stateIds = new Set(asset.interaction.states?.map((state) => state.id) ?? []);
  if (!stateIds.has(asset.interaction.defaultState)) errors.push(`${asset.id}: interaction defaultState is missing from states`);
  for (const state of asset.interaction.states ?? []) {
    if (state.asset && !assetIds.has(state.asset)) errors.push(`${asset.id}/${state.id}: missing state asset ${state.asset}`);
  }
}

if (errors.length) {
  console.error(`FAIL: ${errors.length} scene issue(s)`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`OK: ${scene.name ?? path} has ${scene.floors.length} floor(s), ${assetIds.size} asset(s), and valid cross-references.`);

#!/usr/bin/env node
import fs from 'node:fs';

const [path, columnsRaw = '1', rowsRaw = '1'] = process.argv.slice(2);
if (!path) {
  console.error('Usage: node inspect_png_atlas.mjs <atlas.png> [columns] [rows]');
  process.exit(2);
}
const columns = Number(columnsRaw);
const rows = Number(rowsRaw);
if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) {
  console.error('Columns and rows must be positive integers.');
  process.exit(2);
}
const bytes = fs.readFileSync(path);
const signature = '89504e470d0a1a0a';
if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== signature) {
  console.error('FAIL: file is not a valid PNG with an IHDR header.');
  process.exit(1);
}
const width = bytes.readUInt32BE(16);
const height = bytes.readUInt32BE(20);
const bitDepth = bytes[24];
const colorType = bytes[25];
const hasAlpha = colorType === 4 || colorType === 6;
const divisible = width % columns === 0 && height % rows === 0;

console.log(JSON.stringify({
  path,
  width,
  height,
  bitDepth,
  colorType,
  hasAlpha,
  columns,
  rows,
  cellWidth: width / columns,
  cellHeight: height / rows,
  integerCells: divisible,
}, null, 2));

if (!hasAlpha) {
  console.error('FAIL: PNG has no alpha channel. A visible checkerboard may be baked into RGB pixels.');
  process.exit(1);
}
if (!divisible) {
  console.warn('WARN: atlas dimensions are not evenly divisible. Use floating-point source rectangles or pad/regenerate the atlas.');
}

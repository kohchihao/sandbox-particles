import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { World } from '../src/core/world';
import { materialById } from '../src/materials/registry';
import { EMPTY } from '../src/materials/sand';

const EMPTY_RGB: readonly [number, number, number] = [16, 18, 26];

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]!) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const name = new Uint8Array(4);
  for (let i = 0; i < 4; i++) name[i] = type.charCodeAt(i);
  const body = new Uint8Array(name.length + data.length);
  body.set(name, 0);
  body.set(data, name.length);
  const out = new Uint8Array(8 + body.length);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 4 + body.length);
  return out;
}

export function worldRgb(world: World): Uint8Array {
  const rgb = new Uint8Array(world.width * world.height * 3);
  const { type, shade } = world;
  for (let i = 0; i < type.length; i++) {
    const id = type[i]!;
    const offset = i * 3;
    const base = id === EMPTY ? EMPTY_RGB : (materialById(id)?.color ?? [255, 0, 255]);
    const jitter = id === EMPTY ? 0 : (shade[i]! & 15) - 8;
    rgb[offset] = clamp8(base[0] + jitter);
    rgb[offset + 1] = clamp8(base[1] + jitter);
    rgb[offset + 2] = clamp8(base[2] + jitter);
  }
  return rgb;
}

export function writeRgbPng(path: string, width: number, height: number, rgb: Uint8Array): void {
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = width * 3;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    raw.set(rgb.subarray(y * stride, y * stride + stride), row + 1);
  }
  const png = concat([
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
}

function clamp8(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

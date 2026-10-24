import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { logoUpload, hasImageSignature } from '../src/lib/upload.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(32)]);

let server, url;
before(async () => {
  const app = express();
  app.post('/logo', logoUpload, (req, res) => res.json({ ok: true, size: req.file.size }));
  await new Promise((r) => (server = app.listen(0, r)));
  url = `http://localhost:${server.address().port}/logo`;
});
after(() => server.close());

const send = (buf, type, name = 'logo.png', field = 'logo') => {
  const fd = new FormData();
  fd.append(field, new Blob([buf], { type }), name);
  return fetch(url, { method: 'POST', body: fd });
};

test('firmas de imagen válidas e inválidas', () => {
  assert.equal(hasImageSignature(PNG), true);
  assert.equal(hasImageSignature(JPG), true);
  assert.equal(hasImageSignature(WEBP), true);
  assert.equal(hasImageSignature(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), false);
  assert.equal(hasImageSignature(Buffer.alloc(3)), false);
});

test('acepta PNG, JPG y WebP reales', async () => {
  for (const [buf, type] of [[PNG, 'image/png'], [JPG, 'image/jpeg'], [WEBP, 'image/webp']]) {
    const r = await send(buf, type);
    assert.equal(r.status, 200, type);
  }
});

test('rechaza SVG y otros tipos', async () => {
  const r = await send(Buffer.from('<svg></svg>'), 'image/svg+xml', 'logo.svg');
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /PNG, JPG o WebP/);
});

test('rechaza un archivo que dice ser PNG pero no lo es', async () => {
  const r = await send(Buffer.from('esto no es una imagen, es texto plano de relleno'), 'image/png');
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /no es una imagen/);
});

test('rechaza archivos de más de 2 MB', async () => {
  const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
  const r = await send(big, 'image/png');
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /2 MB/);
});

test('rechaza peticiones sin archivo', async () => {
  const r = await send(PNG, 'image/png', 'logo.png', 'otro-campo');
  assert.equal(r.status, 400);
});

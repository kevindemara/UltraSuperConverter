'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const sharp = require('sharp');
let root, child, base, logs = '';

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'usc-studio-test-'));
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: '0', USC_DATA_DIR: root, USC_PID_FILE: path.join(root, '.server.pid') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${logs}`)), 15000);
    child.stdout.on('data', data => {
      logs += data.toString();
      const match = logs.match(/GUI URL\s+: (http:\/\/localhost:\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    child.stderr.on('data', data => { logs += data.toString(); });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${logs}`)); });
  });
});
after(async () => {
  if (child && child.exitCode === null) { const ended = new Promise(resolve => child.once('exit', resolve)); child.kill(); await ended; }
  if (root) await fs.rm(root, { recursive: true, force: true });
});
async function post(url, body) {
  const response = await fetch(`${base}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200, await response.clone().text()); return response.json();
}
async function upload(name, bytes) {
  const form = new FormData(); form.append('files', new Blob([bytes]), name);
  const response = await fetch(`${base}/api/upload`, { method: 'POST', body: form });
  assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.items.length, 1); return data.items[0];
}
test('Main server exposes the original studio and new toolbox', async () => {
  const home = await (await fetch(base)).text(); assert.match(home, /href="\/tools.html"/);
  const toolbox = await (await fetch(`${base}/tools.html`)).text(); assert.match(toolbox, /id="toolForm"/);
  assert.equal((await (await fetch(`${base}/api/toolbox/catalog`)).json()).tools.length, 30);
  const state = await (await fetch(`${base}/api/state`)).json(); assert.equal(state.engine.sharpVersion, sharp.versions.sharp); assert.ok(state.engine.ffmpegReady);
});
test('Runtime validation reflects the new dependency requirement', () => {
  const { isSupported } = require('../lib/runtime');
  assert.equal(isSupported('18.20.0'), false); assert.equal(isSupported('20.18.9'), false);
  assert.equal(isSupported('20.19.0'), true); assert.equal(isSupported('v24.19.0'), true); assert.equal(isSupported('unknown'), false);
});
test('Existing image studio converts real images through upload, process and download', async () => {
  const png = await sharp({ create: { width: 120, height: 80, channels: 4, background: '#3564ab88' } }).png().toBuffer();
  const item = await upload('regression.png', png); assert.equal(item.width, 120); assert.equal(item.mediaType, 'image');
  for (const format of ['webp', 'jpg', 'png', 'avif', 'tiff', 'gif', 'bmp', 'ico']) {
    const data = await post('/api/process', { itemIds: [item.id], settings: { imageFormat: format, quality: 80, resizeMode: 'dimensions', width: 64, height: 64, fitMode: 'contain', stripMetadata: true } });
    assert.equal(data.items[0].status, 'completed', `${format}: ${data.items[0].error}`);
    const response = await fetch(`${base}${data.items[0].output.url}`); assert.equal(response.status, 200);
    const buffer = Buffer.from(await response.arrayBuffer()); assert.ok(buffer.length > 10);
    if (!['bmp', 'ico'].includes(format)) { const meta = await sharp(buffer).metadata(); assert.equal(meta.width, 64); assert.equal(meta.height, 64); }
  }
});
test('Existing video/audio studio and new toolbox both process uploaded media', async () => {
  const media = path.join(root, 'regression.mp4');
  await promisify(execFile)(require('ffmpeg-static'), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x96:rate=10:duration=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', media], { windowsHide: true });
  const item = await upload('regression.mp4', await fs.readFile(media)); assert.equal(item.mediaType, 'video');
  for (const settings of [{ videoFormat: 'mp4', videoResolution: 'original', audioMode: 'keep' }, { audioMode: 'extract', audioFormat: 'mp3' }]) {
    const data = await post('/api/process', { itemIds: [item.id], settings });
    assert.equal(data.items[0].status, 'completed', data.items[0].error);
    assert.equal((await fetch(`${base}${data.items[0].output.url}`)).status, 200);
  }
  const form = new FormData(); form.append('toolId', 'video-frame'); form.append('files', new Blob([await fs.readFile(media)]), 'frame-source.mp4');
  const response = await fetch(`${base}/api/toolbox/run`, { method: 'POST', body: form }); assert.equal(response.status, 200);
  const data = await response.json(); const image = Buffer.from(await (await fetch(`${base}${data.results[0].url}`)).arrayBuffer());
  assert.equal((await sharp(image).metadata()).width, 160);
});

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const data = process.env.USC_DATA_DIR;
if (process.env.USC_PORTABLE !== '1' || !data || !process.env.USC_PORTABLE_ID) throw new Error('Start UltraSuperConverter.exe to launch the portable app.');
fs.mkdirSync(data, { recursive: true });
const log = fs.openSync(path.join(data, 'server.log'), 'a');
const child = spawn(process.execPath, [path.join(root, 'server.js')], {
  cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log], env: process.env
});
child.once('spawn', () => {
  fs.writeFileSync(path.join(data, 'portable-runtime.json'), JSON.stringify({ pid: child.pid, port: Number(process.env.PORT), node: process.version }));
  child.unref();
});
child.once('error', error => { fs.appendFileSync(path.join(data, 'server.log'), `${error.stack}\n`); process.exitCode = 1; });
fs.closeSync(log);

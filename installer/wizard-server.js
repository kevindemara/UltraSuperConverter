/**
 * UltraSuperConverter — Zero-Dependency HTML Setup Wizard Bootstrapper
 * Uses ONLY built-in Node.js modules (http, fs, path, os, child_process)
 * so the HTML Setup Wizard opens and installs dependencies even on a fresh git clone
 * before `npm install` has ever been run.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');
const { minimumNode, isSupported } = require('../lib/runtime');

const PORT = 3847;
const ROOT_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

function getPreflightStatus() {
  let sharpReady = false;
  let sharpVersion = null;
  let vipsVersion = null;
  let ffmpegReady = false;

  try {
    const sharp = require(path.join(ROOT_DIR, 'node_modules', 'sharp'));
    sharpReady = Boolean(sharp?.versions?.sharp);
    sharpVersion = sharp?.versions?.sharp || null;
    vipsVersion = sharp?.versions?.vips || null;
  } catch (_) {}

  try {
    const ffmpegPath = require(path.join(ROOT_DIR, 'node_modules', 'ffmpeg-static'));
    ffmpegReady = Boolean(ffmpegPath && fs.existsSync(ffmpegPath));
  } catch (_) {}

  const desktopShortcut = path.join(os.homedir(), 'Desktop', 'UltraSuperConverter.lnk');
  return {
    pid: process.pid,
    bootstrapper: true,
    nodeVersion: process.version,
    minimumNodeVersion: minimumNode,
    nodeSupported: isSupported(),
    sharpReady,
    sharpVersion,
    vipsVersion,
    ffmpegReady,
    desktopShortcutExists: fs.existsSync(desktopShortcut)
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const urlPath = req.url.split('?')[0];

  if (urlPath === '/setup' || urlPath === '/setup-wizard.html') {
    const wizFile = path.join(ROOT_DIR, 'setup-wizard.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(wizFile).pipe(res);
  }

  if (urlPath === '/api/wizard/preflight' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(getPreflightStatus()));
  }

  if (urlPath === '/api/wizard/install' && req.method === 'POST') {
    if (!isSupported()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: `Node.js ${minimumNode} or newer is required. Install the current Node.js LTS, then restart the setup wizard.` }));
    }
    const logs = [];
    logs.push(`[1/3] Node.js Runtime Verified: ${process.version}`);
    logs.push(`[2/3] Installing npm dependencies in ${ROOT_DIR}...`);

    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await new Promise((resolve) => {
      execFile(npmCmd, ['install', '--no-audit', '--no-fund'], { cwd: ROOT_DIR, timeout: 180000, shell: true }, (err, stdout, stderr) => {
        if (stdout) logs.push(stdout.trim());
        if (err && stderr) logs.push(stderr.trim());
        resolve();
      });
    });

    const ffmpegInstallScript = path.join(ROOT_DIR, 'node_modules', 'ffmpeg-static', 'install.js');
    if (fs.existsSync(ffmpegInstallScript)) {
      logs.push('[3/3] Verifying static FFmpeg binary...');
      await new Promise((resolve) => {
        execFile(process.execPath, [ffmpegInstallScript], { cwd: ROOT_DIR, timeout: 120000 }, () => resolve());
      });
    }

    ['uploads', 'uploads/thumbs', 'outputs'].forEach((sub) => {
      const d = path.join(ROOT_DIR, sub);
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, log: logs.join('\n') }));
  }

  if (urlPath === '/api/wizard/shortcut' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let opts = { desktop: true, startMenu: true };
      try {
        opts = JSON.parse(body || '{}');
      } catch (_) {}

      const startCmdPath = path.join(ROOT_DIR, 'start.cmd');
      const icoPath = path.join(ROOT_DIR, 'UltraSuperConverter.ico');
      const created = [];
      const psCommands = ['$WshShell = New-Object -ComObject WScript.Shell'];

      if (opts.desktop !== false) {
        psCommands.push(`
          $DesktopDir = [Environment]::GetFolderPath('Desktop')
          $Shortcut = $WshShell.CreateShortcut((Join-Path $DesktopDir 'UltraSuperConverter.lnk'))
          $Shortcut.TargetPath = '${startCmdPath.replace(/'/g, "''")}'
          $Shortcut.WorkingDirectory = '${ROOT_DIR.replace(/'/g, "''")}'
          $Shortcut.Description = 'Launch UltraSuperConverter Quantum Media Engine'
          $Shortcut.IconLocation = '${icoPath.replace(/'/g, "''")},0'
          $Shortcut.WindowStyle = 7
          $Shortcut.Save()
        `);
        created.push('Desktop Icon');
      }

      if (opts.startMenu !== false) {
        psCommands.push(`
          $ProgramsDir = [Environment]::GetFolderPath('Programs')
          $ShortcutSM = $WshShell.CreateShortcut((Join-Path $ProgramsDir 'UltraSuperConverter.lnk'))
          $ShortcutSM.TargetPath = '${startCmdPath.replace(/'/g, "''")}'
          $ShortcutSM.WorkingDirectory = '${ROOT_DIR.replace(/'/g, "''")}'
          $ShortcutSM.Description = 'Launch UltraSuperConverter Quantum Media Engine'
          $ShortcutSM.IconLocation = '${icoPath.replace(/'/g, "''")},0'
          $ShortcutSM.WindowStyle = 7
          $ShortcutSM.Save()
        `);
        created.push('Start Menu');
      }

      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommands.join('\n')],
        { timeout: 15000 },
        (err) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: !err,
              message: created.length ? `Created: ${created.join(' + ')}` : 'No shortcuts selected'
            })
          );
        }
      );
    });
    return;
  }

  // If user clicks "OPEN ULTRASUPERCONVERTER STUDIO" (/), hand off to full server.js if dependencies are installed
  if (urlPath === '/') {
    const expressPath = path.join(ROOT_DIR, 'node_modules', 'express');
    if (fs.existsSync(expressPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="1;url=http://localhost:${PORT}/" /><style>body{font-family:sans-serif;display:grid;place-items:center;height:100vh;background:#f4f7fb;color:#090d16}</style></head><body><h2>Starting UltraSuperConverter Quantum Core...</h2></body></html>`);
      setTimeout(() => {
        server.close(() => {
          spawn(process.execPath, [path.join(ROOT_DIR, 'server.js')], {
            cwd: ROOT_DIR,
            detached: true,
            stdio: 'ignore'
          }).unref();
          process.exit(0);
        });
      }, 200);
      return;
    } else {
      res.writeHead(302, { Location: '/setup' });
      return res.end();
    }
  }

  // Serve static assets from public/
  const staticPath = path.join(ROOT_DIR, 'public', urlPath);
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const ext = path.extname(staticPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    return fs.createReadStream(staticPath).pipe(res);
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`  [Wizard] HTML Setup Wizard running at http://localhost:${PORT}/setup`);
});

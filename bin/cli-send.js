const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3847;
const BASE_URL = `http://localhost:${PORT}`;
const LOCK_FILE = path.join(os.tmpdir(), 'usc_starting.lock');

async function isServerOnline() {
  try {
    const res = await fetch(`${BASE_URL}/api/state`, {
      signal: AbortSignal.timeout(1000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServerRunning() {
  if (await isServerOnline()) return true;

  // Check if another process recently triggered a server start
  let shouldSpawn = true;
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockAge = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
      if (lockAge < 6000) shouldSpawn = false;
    }
  } catch (_) {}

  if (shouldSpawn) {
    try {
      fs.writeFileSync(LOCK_FILE, String(Date.now()), 'utf8');
      const child = spawn('node', ['server.js'], {
        cwd: ROOT_DIR,
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    } catch (err) {
      console.error('Failed to spawn server.js:', err.message);
    }
  }

  // Poll until online (up to 12 seconds)
  const startTime = Date.now();
  while (Date.now() - startTime < 12000) {
    await new Promise((r) => setTimeout(r, 250));
    if (await isServerOnline()) {
      try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
      return true;
    }
  }

  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
  return false;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const paths = rawArgs
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));

  const online = await ensureServerRunning();
  if (!online) {
    console.error('UltraSuperConvertor server could not be started.');
    process.exit(1);
  }

  if (paths.length === 0) {
    exec(`start "" "${BASE_URL}"`);
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/queue-paths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths })
    });
    const data = await res.json();
    if (data.shouldOpenBrowser) {
      exec(`start "" "${BASE_URL}"`);
    }
  } catch (err) {
    console.error('Failed to send paths to UltraSuperConvertor:', err.message);
    exec(`start "" "${BASE_URL}"`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

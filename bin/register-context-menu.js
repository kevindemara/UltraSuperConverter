const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const ICO_PATH = path.join(ROOT_DIR, 'UltraSuperConverter.ico');
const SILENT_VBS = path.join(ROOT_DIR, 'bin', 'silent.vbs');
const CLI_CMD = path.join(ROOT_DIR, 'bin', 'cli-send.cmd');
const CSCRIPT_EXE = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cscript.exe');
const WSCRIPT_EXE = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');

function getSendToDir() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Microsoft', 'Windows', 'SendTo');
}

function getSendToLnkPath() {
  return path.join(getSendToDir(), 'UltraSuperConverter.lnk');
}

function getLegacySendToLnkPath() {
  return path.join(getSendToDir(), 'UltraSuperConvertor.lnk');
}

function runReg(args) {
  try {
    const out = execFileSync('reg.exe', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { ok: true, output: out };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function isContextMenuInstalled() {
  // Keep the original registry identifier so upgrades update existing Explorer entries.
  const res = runReg(['query', 'HKCU\\Software\\Classes\\*\\shell\\UltraSuperConvertor']);
  return res.ok;
}

function isSendToInstalled() {
  return fs.existsSync(getSendToLnkPath()) || fs.existsSync(getLegacySendToLnkPath());
}

function vbsStr(str) {
  return `"${String(str).replace(/"/g, '""')}"`;
}

function installContextMenu({ contextMenu = true, sendTo = true } = {}) {
  const results = { contextMenu: false, sendTo: false };

  if (contextMenu) {
    const cmdStr = `"${WSCRIPT_EXE}" "${SILENT_VBS}" "${CLI_CMD}" "%1"`;
    const bgCmdStr = `"${WSCRIPT_EXE}" "${SILENT_VBS}" "${CLI_CMD}" "%V"`;

    // 1. All files
    runReg(['add', 'HKCU\\Software\\Classes\\*\\shell\\UltraSuperConvertor', '/ve', '/d', 'Convert with UltraSuperConverter', '/f']);
    runReg(['add', 'HKCU\\Software\\Classes\\*\\shell\\UltraSuperConvertor', '/v', 'Icon', '/d', ICO_PATH, '/f']);
    runReg(['add', 'HKCU\\Software\\Classes\\*\\shell\\UltraSuperConvertor\\command', '/ve', '/d', cmdStr, '/f']);

    // 2. Directories (folders)
    runReg(['add', 'HKCU\\Software\\Classes\\Directory\\shell\\UltraSuperConvertor', '/ve', '/d', 'Convert with UltraSuperConverter', '/f']);
    runReg(['add', 'HKCU\\Software\\Classes\\Directory\\shell\\UltraSuperConvertor', '/v', 'Icon', '/d', ICO_PATH, '/f']);
    runReg(['add', 'HKCU\\Software\\Classes\\Directory\\shell\\UltraSuperConvertor\\command', '/ve', '/d', cmdStr, '/f']);

    // 3. Directory Background (inside folders)
    runReg(['add', 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\UltraSuperConvertor', '/ve', '/d', 'Convert with UltraSuperConverter', '/f']);
    runReg(['add', 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\UltraSuperConvertor', '/v', 'Icon', '/d', ICO_PATH, '/f']);
    runReg(['add', 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\UltraSuperConvertor\\command', '/ve', '/d', bgCmdStr, '/f']);

    results.contextMenu = isContextMenuInstalled();
  }

  if (sendTo) {
    const sendToDir = getSendToDir();
    if (fs.existsSync(sendToDir)) {
      const lnkPath = getSendToLnkPath();
      if (!fs.existsSync(lnkPath) && fs.existsSync(getLegacySendToLnkPath())) {
        fs.renameSync(getLegacySendToLnkPath(), lnkPath);
      }
      const vbsScript = [
        'Set WshShell = CreateObject("WScript.Shell")',
        `Set Shortcut = WshShell.CreateShortcut(${vbsStr(lnkPath)})`,
        `Shortcut.TargetPath = ${vbsStr(WSCRIPT_EXE)}`,
        `Shortcut.Arguments = ${vbsStr(`"${SILENT_VBS}" "${CLI_CMD}"`)}`,
        `Shortcut.WorkingDirectory = ${vbsStr(ROOT_DIR)}`,
        `Shortcut.Description = "Convert with UltraSuperConverter"`,
        `Shortcut.IconLocation = ${vbsStr(`${ICO_PATH},0`)}`,
        'Shortcut.Save()'
      ].join('\r\n');

      const tempVbs = path.join(os.tmpdir(), `create_sendto_${Date.now()}.vbs`);
      try {
        fs.writeFileSync(tempVbs, vbsScript, 'utf8');
        execFileSync(CSCRIPT_EXE, ['//nologo', '//B', tempVbs], { timeout: 5000, stdio: 'ignore' });
        results.sendTo = isSendToInstalled();
      } catch (err) {
        console.error('Failed to create SendTo shortcut:', err.message);
      } finally {
        try { fs.unlinkSync(tempVbs); } catch (_) {}
      }
    }
  }

  return results;
}

function uninstallContextMenu() {
  runReg(['delete', 'HKCU\\Software\\Classes\\*\\shell\\UltraSuperConvertor', '/f']);
  runReg(['delete', 'HKCU\\Software\\Classes\\Directory\\shell\\UltraSuperConvertor', '/f']);
  runReg(['delete', 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\UltraSuperConvertor', '/f']);

  for (const lnkPath of [getSendToLnkPath(), getLegacySendToLnkPath()]) {
    if (fs.existsSync(lnkPath)) {
      try { fs.unlinkSync(lnkPath); } catch (_) {}
    }
  }

  return {
    contextMenu: !isContextMenuInstalled(),
    sendTo: !isSendToInstalled()
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--uninstall') || args.includes('-u')) {
    const res = uninstallContextMenu();
    console.log('[OK] UltraSuperConverter context menu and SendTo shortcut removed successfully.');
  } else {
    const res = installContextMenu();
    console.log('[OK] UltraSuperConverter context menu registered:', res.contextMenu);
    console.log('[OK] UltraSuperConverter SendTo shortcut created:', res.sendTo);
  }
}

module.exports = {
  isContextMenuInstalled,
  isSendToInstalled,
  installContextMenu,
  uninstallContextMenu
};

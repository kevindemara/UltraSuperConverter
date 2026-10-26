'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const archiver = require('archiver');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');

async function build() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build on Windows x64 with dependencies installed for that platform.');
  require('../lib/runtime').assertSupported();
  const name = `UltraSuperConverter-${pkg.version}-win-x64`;
  const folder = path.join(root, 'dist', name);
  const archivePath = `${folder}.zip`;
  if (fs.existsSync(folder) || fs.existsSync(archivePath)) throw new Error(`Build output already exists: ${folder}. Move it aside before rebuilding; it may contain user data.`);
  const nodeLicense = path.join(root, '.portable-cache', `node-${process.version}-LICENSE.txt`);
  if (!fs.existsSync(nodeLicense)) throw new Error(`Save https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE as ${nodeLicense}, then rebuild.`);
  const compiler = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  if (!fs.existsSync(compiler)) throw new Error('The Windows .NET Framework C# compiler is required to build the launcher.');
  fs.mkdirSync(path.join(folder, 'App'), { recursive: true });
  fs.mkdirSync(path.join(folder, 'Runtime'));
  fs.mkdirSync(path.join(folder, 'Licenses'));
  console.log('Copying app and Windows conversion dependencies…');
  // Explicit allowlist: never ship uploads, outputs, local workspace data, tests, Git metadata or user settings.
  for (const name of ['server.js', 'package.json', 'package-lock.json', 'setup-wizard.html', 'UltraSuperConverter.ico', 'README.md', 'lib', 'public', 'bin', 'portable']) {
    fs.cpSync(path.join(root, name), path.join(folder, 'App', name), { recursive: true });
  }
  fs.cpSync(path.join(root, 'node_modules'), path.join(folder, 'App', 'node_modules'), {
    recursive: true, dereference: true,
    filter: source => {
      const rel = path.relative(path.join(root, 'node_modules'), source).replaceAll('\\', '/');
      return !/(^|\/)(\.cache|\.bin)(\/|$)/.test(rel) && !/^ffprobe-static\/bin\/(darwin|linux|win32\/ia32)(\/|$)/.test(rel);
    }
  });
  fs.copyFileSync(process.execPath, path.join(folder, 'Runtime', 'node.exe'));
  fs.copyFileSync(nodeLicense, path.join(folder, 'Licenses', 'Node.js-LICENSE.txt'));
  fs.copyFileSync(path.join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe.LICENSE'), path.join(folder, 'Licenses', 'FFmpeg-GPL-3.0.txt'));
  fs.copyFileSync(path.join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe.README'), path.join(folder, 'Licenses', 'FFmpeg-build-and-source.txt'));
  fs.writeFileSync(path.join(folder, 'Licenses', 'THIRD-PARTY.txt'), [
    'Node.js: https://github.com/nodejs/node/tree/' + process.version,
    'FFmpeg: https://github.com/eugeneware/ffmpeg-static (bundled binary build/source details in FFmpeg-build-and-source.txt).',
    'FFprobe 4.0.2: https://github.com/joshwnj/ffprobe-static and https://github.com/FFmpeg/FFmpeg/tree/n4.0.2 (GPL v3).',
    'All npm package license files and notices are retained under App/node_modules. Exact dependency versions are in App/package-lock.json.',
    'This portable bundle contains separate third-party components governed by their respective licenses.'
  ].join('\r\n'));
  console.log('Compiling the Windows launcher…');
  execFileSync(compiler, ['/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/reference:System.Windows.Forms.dll', '/reference:System.Web.Extensions.dll', `/win32icon:${path.join(root, 'UltraSuperConverter.ico')}`, `/out:${path.join(folder, 'UltraSuperConverter.exe')}`, path.join(root, 'portable', 'Launcher.cs')], { stdio: 'inherit', windowsHide: true });
  fs.writeFileSync(path.join(folder, 'START-HERE.txt'), `UltraSuperConverter ${pkg.version} — Windows x64 portable\r\n\r\n1. Extract the entire ZIP to a writable folder.\r\n2. Double-click UltraSuperConverter.exe. Keep App and Runtime beside it.\r\n3. Your default browser opens the app. Use Quit in the app to stop its local engine.\r\n\r\nNo Node.js installation, npm, setup wizard or administrator access is needed. Windows 10/11 x64 with .NET Framework 4.x is required. The launcher is unsigned; Windows may show a publisher/reputation prompt.\r\n\r\nUploads, outputs, recipes, history and logs are kept in Data beside the EXE. Keep Data when moving/upgrading. Browser favorites and recent tools remain in the browser profile. Use a writable local folder; read-only media and Program Files are unsuitable.\r\n\r\nThe app binds only to this computer. If its preferred port is busy, another local port is selected. Double-clicking again reopens the same portable instance. No services, registry entries or shortcuts are installed.\r\n\r\nTo update, quit the app, extract a newer portable ZIP into a new folder and copy your Data folder into it. Portable builds do not run the source updater or setup wizard.\r\n\r\nOptional launcher flags: --no-browser, --port 3847\r\nThird-party licenses and source locations: Licenses and App/node_modules.\r\n`);
  fs.writeFileSync(path.join(folder, 'portable-build.json'), JSON.stringify({ app: pkg.name, version: pkg.version, node: process.version, platform: 'win32-x64', builtAt: new Date().toISOString() }, null, 2));
  console.log('Testing the packaged EXE and conversion engines…');
  execFileSync(process.execPath, [path.join(__dirname, 'test-portable.js'), folder], { stdio: 'inherit', windowsHide: true, timeout: 120000 });
  console.log('Creating ZIP…');
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath);
    const zip = archiver('zip', { zlib: { level: 6 } });
    output.on('close', resolve); output.on('error', reject); zip.on('error', reject); zip.on('warning', reject);
    zip.pipe(output); zip.directory(folder, name); zip.finalize().catch(reject);
  });
  const sha256 = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(archivePath)) sha256.update(chunk);
  fs.writeFileSync(`${archivePath}.sha256`, `${sha256.digest('hex')}  ${path.basename(archivePath)}\n`);
  console.log(`Portable folder: ${folder}\nZIP: ${archivePath}\nSize: ${(fs.statSync(archivePath).size / 1024 / 1024).toFixed(1)} MB`);
}
build().catch(error => { console.error(error.message); process.exitCode = 1; });

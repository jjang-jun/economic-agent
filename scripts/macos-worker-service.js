const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LABEL = 'com.economic-agent.worker';
const ROOT = path.resolve(__dirname, '..');
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const LOG_DIR = path.join(ROOT, 'data', 'logs');

function xml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildPlist(options = {}) {
  const root = options.root || ROOT;
  const node = options.node || process.execPath;
  const logDir = options.logDir || path.join(root, 'data', 'logs');
  const preventSleepOnAc = options.preventSleepOnAc === true;
  const workerArguments = [
    ...(preventSleepOnAc ? ['/usr/bin/caffeinate', '-s'] : []),
    node,
    `--env-file-if-exists=${path.join(root, '.env')}`,
    path.join(root, 'scripts', 'discord-agent-worker.js'),
  ].map(value => `    <string>${xml(value)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${workerArguments}
  </array>
  <key>WorkingDirectory</key><string>${xml(root)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${xml(path.join(logDir, 'discord-agent-worker.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(logDir, 'discord-agent-worker.error.log'))}</string>
</dict>
</plist>
`;
}

function launchctl(args, options = {}) {
  const result = spawnSync('launchctl', args, { encoding: 'utf8' });
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`launchctl ${args[0]} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result;
}

function domain() {
  return `gui/${process.getuid()}`;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function bootstrapWithRetry(plist = PLIST, attempts = 3) {
  let result;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    result = launchctl(['bootstrap', domain(), plist], { allowFailure: true });
    if (result.status === 0) return;
    if (attempt < attempts - 1) sleepSync(300 * (attempt + 1));
  }
  throw new Error(`launchctl bootstrap failed: ${(result?.stderr || result?.stdout || '').trim()}`);
}

function install() {
  if (process.platform !== 'darwin') throw new Error('This installer is only for macOS');
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const preventSleepOnAc = String(process.env.PC_WORKER_PREVENT_SLEEP_ON_AC || '').toLowerCase() === 'true';
  fs.writeFileSync(PLIST, buildPlist({ preventSleepOnAc }), { mode: 0o600 });
  fs.chmodSync(PLIST, 0o600);
  const bootout = launchctl(['bootout', `${domain()}/${LABEL}`], { allowFailure: true });
  if (bootout.status === 0) sleepSync(300);
  bootstrapWithRetry();
  launchctl(['enable', `${domain()}/${LABEL}`]);
  launchctl(['kickstart', '-k', `${domain()}/${LABEL}`]);
  console.log(`[PCWorker] macOS LaunchAgent 설치 완료: ${LABEL} (AC 절전 방지=${preventSleepOnAc ? '사용' : '미사용'})`);
}

function status() {
  const result = launchctl(['print', `${domain()}/${LABEL}`]);
  process.stdout.write(result.stdout);
}

function uninstall() {
  if (process.platform !== 'darwin') throw new Error('This uninstaller is only for macOS');
  launchctl(['bootout', `${domain()}/${LABEL}`], { allowFailure: true });
  if (fs.existsSync(PLIST)) fs.unlinkSync(PLIST);
  console.log(`[PCWorker] macOS LaunchAgent 제거 완료: ${LABEL}`);
}

function main() {
  const command = process.argv[2] || 'status';
  if (command === 'install') return install();
  if (command === 'status') return status();
  if (command === 'uninstall') return uninstall();
  throw new Error(`Unsupported service command: ${command}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[PCWorker] ${error.message}`);
    process.exit(1);
  }
}

module.exports = { LABEL, ROOT, PLIST, LOG_DIR, bootstrapWithRetry, buildPlist, domain, sleepSync };

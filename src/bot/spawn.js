const { spawn } = require('child_process');
const path = require('path');

module.exports = function spawnBot() {
  const botProcess = spawn('node', ['index.js'], {
    cwd: path.join(__dirname, '../../bankeru_tg_bot'),
    env: process.env,
  });

  const log = (prefix, colorCode, data) => {
    const msg = data.toString().trim();
    if (!msg) return;
    msg.split('\n').forEach(line => console.log(`${colorCode}${prefix}\x1b[0m ${line}`));
  };

  botProcess.stdout.on('data', d => log('[Bot]', '\x1b[35m', d));
  botProcess.stderr.on('data', d => log('[Bot Error]', '\x1b[31m', d));
  botProcess.on('close', code => console.log(`\x1b[33m[Bot] exited with code ${code}\x1b[0m`));

  const cleanup = () => {
    try { botProcess.kill('SIGINT'); } catch (_) {}
  };

  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
};

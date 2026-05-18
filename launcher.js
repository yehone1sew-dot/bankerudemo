const { spawn } = require('child_process');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '🃏 Starting Bankeru Fullstack Application (Server + Bot)...');

function logWithPrefix(prefix, colorCode, data) {
  const message = data.toString().trim();
  if (!message) return;
  
  // Split multiple lines to preserve prefixes on each line
  message.split('\n').forEach(line => {
    console.log(`${colorCode}${prefix}\x1b[0m ${line}`);
  });
}

// 1. Spawn Game Server
const serverProcess = spawn('node', ['server.js'], {
  cwd: __dirname,
  env: process.env
});

serverProcess.stdout.on('data', (data) => {
  logWithPrefix('[Server]', '\x1b[32m', data); // Green
});

serverProcess.stderr.on('data', (data) => {
  logWithPrefix('[Server Error]', '\x1b[31m', data); // Red
});

serverProcess.on('close', (code) => {
  console.log(`\x1b[33m[Server] Process exited with code ${code}\x1b[0m`);
  cleanup();
});

// 2. Spawn Telegram Bot
const botProcess = spawn('node', ['index.js'], {
  cwd: path.join(__dirname, 'bankeru_tg_bot'),
  env: process.env
});

botProcess.stdout.on('data', (data) => {
  logWithPrefix('[Bot]', '\x1b[35m', data); // Magenta
});

botProcess.stderr.on('data', (data) => {
  logWithPrefix('[Bot Error]', '\x1b[31m', data); // Red
});

botProcess.on('close', (code) => {
  console.log(`\x1b[33m[Bot] Process exited with code ${code}\x1b[0m`);
});

// Cleanup sub-processes on termination
let isCleaningUp = false;
function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  console.log('\x1b[33m%s\x1b[0m', '\n👋 Shutting down all Bankeru processes...');
  
  try {
    serverProcess.kill('SIGINT');
  } catch (e) {}
  
  try {
    botProcess.kill('SIGINT');
  } catch (e) {}
  
  setTimeout(() => {
    process.exit(0);
  }, 500);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

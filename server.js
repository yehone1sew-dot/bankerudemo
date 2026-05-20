const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const config = require('./src/config');
const httpsRedirect = require('./src/middleware/httpsRedirect');
const GameService = require('./src/services/GameService');
const registerGameHandlers = require('./src/sockets/gameHandlers');
const spawnBot = require('./src/bot/spawn');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.CORS_ORIGIN } });

app.enable('trust proxy');
app.use(httpsRedirect);
app.use(express.static(path.join(__dirname, 'public')));

const gameService = new GameService(io);

io.on('connection', (socket) => {
  console.log('connected:', socket.id);
  registerGameHandlers(io, socket, gameService);
});

server.listen(config.PORT, () => {
  console.log('\x1b[32m%s\x1b[0m', `🟢 Bankeru running at http://localhost:${config.PORT}`);
  if (config.START_BOT) {
    spawnBot();
  } else {
    console.log('\x1b[33m%s\x1b[0m', 'ℹ️  Bot disabled (START_BOT=false)');
  }
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const dbService = require('./db');

const app = express();

app.enable('trust proxy');

// Redirect HTTP to HTTPS in production, but allow HTTP on localhost
app.use((req, res, next) => {
  const host = req.header('host') || '';
  if (!host.includes('localhost') && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(`https://${host}${req.url}`);
  }
  next();
});
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Game State ────────────────────────────────────────────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };

const rooms = {};   // roomId -> GameRoom

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ suit: s, rank: r, value: RANK_VALUES[r] });
  return shuffle(deck);
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function createRoom(roomId, hostName) {
  return {
    id: roomId,
    players: [],
    host: null,
    deck: makeDeck(),
    pot: 0,
    anteAmount: 10,
    initialAnteAmount: 10,
    currentPlayerIndex: 0,
    phase: 'waiting',   // waiting | ante | deal1 | bet | deal3 | result | gameover
    tableCards: [],     // [card1, card2, card3]
    currentBet: 0,
    lastResult: null,
    messages: [],
    round: 0,
  };
}

function createPlayer(socketId, name, chips, dbUserId = null) {
  return { id: socketId, name, chips, ante: false, bet: 0, isReady: false, dbUserId };
}

function dealCard(room) {
  if (room.deck.length < 10) room.deck = makeDeck();
  return room.deck.pop();
}

function cardSuitClass(suit) {
  return (suit === '♥' || suit === '♦') ? 'red' : 'black';
}

function evaluateResult(c1, c2, c3) {
  const lo = Math.min(c1.value, c2.value);
  const hi = Math.max(c1.value, c2.value);
  if (c3.value === lo || c3.value === hi) return 'replay';
  if (c3.value > lo && c3.value < hi) return 'win';
  return 'lose';
}

function emitRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  io.to(roomId).emit('room_update', sanitizeRoom(room));
}

function sanitizeRoom(room) {
  return {
    id: room.id,
    players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, ante: p.ante })),
    pot: room.pot,
    anteAmount: room.anteAmount,
    currentPlayerIndex: room.currentPlayerIndex,
    phase: room.phase,
    tableCards: room.tableCards,
    currentBet: room.currentBet,
    lastResult: room.lastResult,
    messages: room.messages.slice(-30),
    round: room.round,
    host: room.host,
  };
}

function addMessage(room, msgData, type = 'info') {
  const text = typeof msgData === 'string' ? msgData : msgData.key;
  room.messages.push({ text, msgData: typeof msgData === 'object' ? msgData : null, type, ts: Date.now() });
}

// ── Computer (Bot) Logic ──────────────────────────────────────────────────────
function botDecide(room) {
  const [c1, c2] = room.tableCards;
  if (!c1 || !c2) return;
  const lo = Math.min(c1.value, c2.value);
  const hi = Math.max(c1.value, c2.value);
  const spread = hi - lo;

  // Bot bets proportional to the spread (gap between cards)
  let bet = 0;
  if (spread <= 1) {
    // Very risky — pass or minimal
    bet = 0;
  } else if (spread >= 10) {
    bet = Math.min(room.pot, 50);
  } else {
    bet = Math.min(room.pot, Math.floor((spread / 12) * 40));
  }

  const botPlayer = room.players.find(p => p.id === 'bot');
  if (bet > botPlayer.chips) bet = botPlayer.chips;
  return bet;
}

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  // ── Get / Create Profile ──
  socket.on('get_profile', async ({ telegramId, username }) => {
    try {
      const user = await dbService.getOrCreateUser(telegramId, username);
      socket.data.dbUser = user;
      const platformBalance = await dbService.getPlatformBalance();
      socket.emit('profile_loaded', { user, platformBalance });
    } catch (e) {
      console.error('Error fetching profile:', e);
      socket.emit('error_msg', { key: 'Failed to load profile. Please reconnect.' });
    }
  });

  // Helper to ensure socket has a valid database user loaded
  const ensureDbUser = async (name) => {
    const user = await dbService.getOrCreateUser(socket.data.dbUser?.telegram_id || null, name || 'Player');
    socket.data.dbUser = user;
    return user;
  };

  const leaveRoom = async (socket) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];

    // Find player and refund remaining table chips to DB
    const player = room.players.find(p => p.id === socket.id);
    if (player && player.dbUserId && player.chips > 0) {
      try {
        await dbService.refundChips(player.dbUserId, player.chips);
      } catch (e) {
        console.error('Failed to refund chips on leaving room:', e);
      }
    }

    // Remove player
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(roomId);
    delete socket.data.roomId;

    if (room.players.length === 0) {
      delete rooms[roomId];
    } else {
      if (room.host === socket.id) room.host = room.players[0].id;
      addMessage(room, { key: 'log_player_left' }, 'system');
      emitRoom(roomId);
    }
  };

  // ── Create Room ──
  socket.on('create_room', async ({ name, buyIn, anteAmount }) => {
    try {
      const dbUser = await ensureDbUser(name);
      const buyInAmt = Math.max(10, Math.min(parseInt(buyIn, 10) || 200, dbUser.chips));

      // Deduct buy-in immediately from database
      await dbService.deductChips(dbUser.id, buyInAmt);

      const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
      const room = createRoom(roomId, dbUser.username);
      room.anteAmount = anteAmount || 10;
      room.initialAnteAmount = anteAmount || 10;

      const player = createPlayer(socket.id, dbUser.username, buyInAmt, dbUser.id);
      room.players.push(player);
      room.host = socket.id;
      rooms[roomId] = room;
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.emit('room_created', { roomId });
      emitRoom(roomId);
    } catch (e) {
      console.error(e);
      socket.emit('error_msg', 'Failed to create room.');
    }
  });

  // ── Join Room ──
  socket.on('join_room', async ({ roomId, name, buyIn }) => {
    try {
      const dbUser = await ensureDbUser(name);
      const buyInAmt = Math.max(10, Math.min(parseInt(buyIn, 10) || 200, dbUser.chips));

      const room = rooms[roomId];
      if (!room) { socket.emit('error_msg', { key: 'err_room_not_found' }); return; }
      if (room.phase !== 'waiting' && room.phase !== 'ante') { socket.emit('error_msg', { key: 'err_game_in_progress' }); return; }
      if (room.players.length >= 6) { socket.emit('error_msg', { key: 'err_room_full' }); return; }

      const existing = room.players.find(p => p.id === socket.id);
      if (!existing) {
        // Deduct buy-in immediately from database
        await dbService.deductChips(dbUser.id, buyInAmt);
        const player = createPlayer(socket.id, dbUser.username, buyInAmt, dbUser.id);
        room.players.push(player);
      } else {
        // Adjust chips if they were already in the room
        const diff = buyInAmt - existing.chips;
        if (diff > 0) {
          await dbService.deductChips(dbUser.id, diff);
        } else if (diff < 0) {
          await dbService.refundChips(dbUser.id, -diff);
        }
        existing.chips = buyInAmt;
        existing.dbUserId = dbUser.id;
      }

      socket.join(roomId);
      socket.data.roomId = roomId;
      addMessage(room, { key: 'log_player_joined', name: dbUser.username }, 'join');
      emitRoom(roomId);
    } catch (e) {
      console.error(e);
      socket.emit('error_msg', 'Failed to join room.');
    }
  });

  // ── Start Game (Host) ──
  socket.on('start_game', () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 1) return;

    const minChips = Math.min(...room.players.map(p => p.chips));
    room.anteAmount = Math.min(room.initialAnteAmount, minChips);

    room.phase = 'ante';
    room.round = 1;
    room.currentPlayerIndex = 0;
    room.pot = 0;
    room.players.forEach(p => { p.ante = false; });
    addMessage(room, { key: 'log_game_started' }, 'system');
    emitRoom(roomId);
  });

  // ── Demo vs Computer ──
  socket.on('start_demo', async ({ name, buyIn }) => {
    try {
      const dbUser = await ensureDbUser(name);
      const buyInAmt = Math.max(10, Math.min(parseInt(buyIn, 10) || 200, dbUser.chips));

      // Deduct buy-in immediately from database
      await dbService.deductChips(dbUser.id, buyInAmt);

      const roomId = 'demo_' + socket.id;
      const room = createRoom(roomId, dbUser.username);
      room.anteAmount = 10;
      room.initialAnteAmount = 10;

      const human = createPlayer(socket.id, dbUser.username, buyInAmt, dbUser.id);
      const bot = createPlayer('bot', '🤖 Computer', 100, null);
      room.players.push(human, bot);
      room.host = socket.id;
      rooms[roomId] = room;
      socket.join(roomId);
      socket.data.roomId = roomId;

      const minChips = Math.min(...room.players.map(p => p.chips));
      room.anteAmount = Math.min(room.initialAnteAmount, minChips);

      room.phase = 'ante';
      room.round = 1;
      addMessage(room, { key: 'log_demo_mode' }, 'system');
      emitRoom(roomId);

      // Bot antes automatically
      setTimeout(() => autoAnte(room, 'bot', io, roomId), 800);
    } catch (e) {
      console.error(e);
      socket.emit('error_msg', 'Failed to start demo.');
    }
  });

  // ── Ante ──
  socket.on('ante', async () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room || room.phase !== 'ante') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.ante) return;
    if (player.chips < room.anteAmount) { socket.emit('error_msg', { key: 'err_not_enough_chips_ante' }); return; }

    player.chips -= room.anteAmount;
    player.ante = true;
    room.pot += room.anteAmount;

    addMessage(room, { key: 'log_player_anted', name: player.name, amount: room.anteAmount }, 'ante');

    // Check if everyone has anted
    const allAnted = room.players.every(p => p.ante);
    if (allAnted) {
      startRound(room);
    }
    emitRoom(roomId);
  });

  // ── Place Bet ──
  socket.on('place_bet', ({ bet }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room || room.phase !== 'bet') return;
    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) return;

    const betAmt = parseInt(bet, 10);
    if (isNaN(betAmt) || betAmt < 0) return;
    if (betAmt > currentPlayer.chips) { socket.emit('error_msg', { key: 'err_not_enough_chips' }); return; }
    if (betAmt > room.pot) { socket.emit('error_msg', { key: 'err_max_bet', amount: room.pot }); return; }

    currentPlayer.bet = betAmt;
    room.currentBet = betAmt;
    addMessage(room, { key: 'log_player_bet', name: currentPlayer.name, amount: betAmt }, 'bet');

    // Deal 3rd card
    const c3 = dealCard(room);
    room.tableCards.push(c3);
    room.phase = 'deal3';
    emitRoom(roomId);

    setTimeout(() => resolveRound(room, roomId), 1200);
  });

  // ── Pass (bet 0) ──
  socket.on('pass', () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room || room.phase !== 'bet') return;
    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) return;

    currentPlayer.bet = 0;
    room.currentBet = 0;
    addMessage(room, { key: 'log_player_passed', name: currentPlayer.name }, 'pass');

    const c3 = dealCard(room);
    room.tableCards.push(c3);
    room.phase = 'deal3';
    emitRoom(roomId);

    setTimeout(() => resolveRound(room, roomId), 1200);
  });

  // ── Leave Room ──
  socket.on('leave_room', () => {
    leaveRoom(socket);
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    leaveRoom(socket);
  });
});

// ── Game Logic Functions ──────────────────────────────────────────────────────
function autoAnte(room, playerId, io, roomId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player || player.ante || room.phase !== 'ante') return;
  if (player.chips < room.anteAmount) return;
  player.chips -= room.anteAmount;
  player.ante = true;
  room.pot += room.anteAmount;

  addMessage(room, { key: 'log_player_anted', name: player.name, amount: room.anteAmount }, 'ante');
  const allAnted = room.players.every(p => p.ante);
  if (allAnted) startRound(room);
  emitRoom(roomId);
}

function startRound(room) {
  room.tableCards = [];
  room.lastResult = null;
  room.phase = 'deal1';
  const c1 = dealCard(room);
  const c2 = dealCard(room);
  room.tableCards = [c1, c2];
  room.phase = 'bet';
  const currentPlayer = room.players[room.currentPlayerIndex];
  addMessage(room, { key: 'log_deal_turn', name: currentPlayer.name, c1: c1.rank + c1.suit, c2: c2.rank + c2.suit }, 'deal');

  // If current player is bot, auto-decide
  if (currentPlayer.id === 'bot') {
    const roomId = room.id;
    setTimeout(() => {
      const bet = botDecide(room);
      currentPlayer.bet = bet;
      room.currentBet = bet;
      const msgData = bet === 0 ? { key: 'log_bot_passes' } : { key: 'log_bot_bets', amount: bet };
      addMessage(room, msgData, bet === 0 ? 'pass' : 'bet');
      const c3 = dealCard(room);
      room.tableCards.push(c3);
      room.phase = 'deal3';
      emitRoom(roomId);
      setTimeout(() => resolveRound(room, roomId), 1200);
    }, 1500);
  }
}

async function resolveRound(room, roomId) {
  const [c1, c2, c3] = room.tableCards;
  const result = evaluateResult(c1, c2, c3);
  const currentPlayer = room.players[room.currentPlayerIndex];
  const bet = room.currentBet;

  if (bet === 0) {
    // Passed — no money exchange
    room.lastResult = { result: 'pass', player: currentPlayer.name, playerId: currentPlayer.id, bet: 0, card: c3 };
    addMessage(room, { key: 'log_pass_result', name: currentPlayer.name }, 'pass');
  } else if (result === 'win') {
    // 5% goes to the platform, 95% goes to the winner
    const platformFee = Math.floor(bet * 0.05);
    const netWin = bet - platformFee;

    currentPlayer.chips += netWin;
    room.pot -= bet;

    // Persist to DB asynchronously
    if (currentPlayer.dbUserId) {
      try {
        await dbService.recordRoundWinOnly(currentPlayer.dbUserId);
        await dbService.addPlatformFee(platformFee);
      } catch (e) {
        console.error('Error updating DB for win:', e);
      }
    }

    room.lastResult = { result: 'win', player: currentPlayer.name, playerId: currentPlayer.id, bet: netWin, card: c3 };
    addMessage(room, { key: 'log_win_result', name: currentPlayer.name, amount: netWin, card: c3.rank + c3.suit }, 'win');
  } else if (result === 'replay') {
    room.lastResult = { result: 'replay', player: currentPlayer.name, playerId: currentPlayer.id, bet, card: c3 };
    addMessage(room, { key: 'log_replay_result', name: currentPlayer.name, card: c3.rank + c3.suit }, 'post');
  } else {
    // Lose
    currentPlayer.chips -= bet;
    room.pot += bet;

    // Persist to DB asynchronously
    if (currentPlayer.dbUserId) {
      try {
        await dbService.recordRoundLossOnly(currentPlayer.dbUserId);
      } catch (e) {
        console.error('Error updating DB for loss:', e);
      }
    }

    room.lastResult = { result: 'lose', player: currentPlayer.name, playerId: currentPlayer.id, bet, card: c3 };
    addMessage(room, { key: 'log_lose_result', name: currentPlayer.name, amount: bet, card: c3.rank + c3.suit }, 'lose');
  }

  room.phase = 'result';
  emitRoom(roomId);

  // Advance to next player after delay
  setTimeout(() => {
    if (result === 'replay') {
      startRound(room);
      emitRoom(roomId);
    } else {
      nextTurn(room, roomId);
    }
  }, 3000);
}

async function nextTurn(room, roomId) {
  // Remove broke players
  room.players = room.players.filter(p => p.chips > 0);
  if (room.players.length <= 1) {
    room.phase = 'gameover';
    if (room.players.length === 1) {
      const winner = room.players[0];
      const remainingPot = room.pot;
      const platformFee = Math.floor(remainingPot * 0.05);
      const netWin = remainingPot - platformFee;

      winner.chips += netWin;
      room.pot = 0;

      // Persist game win to DB asynchronously
      if (winner.dbUserId) {
        try {
          await dbService.recordRoundWinOnly(winner.dbUserId);
          await dbService.addPlatformFee(platformFee);
        } catch (e) {
          console.error('Error updating DB for game win:', e);
        }
      }

      addMessage(room, { key: 'log_player_wins_game', name: winner.name }, 'win');
      addMessage(room, { key: 'status_win', name: winner.name, amount: netWin }, 'win');
    }
    emitRoom(roomId);
    return;
  }

  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  room.round++;

  const minChips = Math.min(...room.players.map(p => p.chips));
  room.anteAmount = Math.min(room.initialAnteAmount, minChips);

  // Re-ante when pot is empty or every N rounds
  if (room.pot < room.anteAmount * room.players.length || room.round % 10 === 0) {
    room.phase = 'ante';
    room.players.forEach(p => { p.ante = false; });
    addMessage(room, { key: 'log_new_round', amount: room.anteAmount }, 'system');
    emitRoom(roomId);

    // Bot antes automatically in demo
    const bot = room.players.find(p => p.id === 'bot');
    if (bot) setTimeout(() => autoAnte(room, 'bot', io, roomId), 800);
    return;
  } else {
    startRound(room);
    emitRoom(roomId);
  }
}

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('\x1b[32m%s\x1b[0m', `🟢 Bankeru Web Server running at http://localhost:${PORT}`);

  // ── Spawn Telegram Bot (if enabled) ──
  const startBot = process.env.START_BOT !== 'false';
  if (startBot) {
    const { spawn } = require('child_process');

    const botProcess = spawn('node', ['index.js'], {
      cwd: path.join(__dirname, 'bankeru_tg_bot'),
      env: process.env
    });

    const logWithPrefix = (prefix, colorCode, data) => {
      const message = data.toString().trim();
      if (!message) return;
      message.split('\n').forEach(line => {
        console.log(`${colorCode}${prefix}\x1b[0m ${line}`);
      });
    };

    botProcess.stdout.on('data', (data) => {
      logWithPrefix('[Bot]', '\x1b[35m', data); // Magenta
    });

    botProcess.stderr.on('data', (data) => {
      logWithPrefix('[Bot Error]', '\x1b[31m', data); // Red
    });

    botProcess.on('close', (code) => {
      console.log(`\x1b[33m[Bot] Process exited with code ${code}\x1b[0m`);
    });

    // Clean up child process on server termination
    const cleanup = () => {
      try { botProcess.kill('SIGINT'); } catch (e) { }
    };

    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  } else {
    console.log('\x1b[33m%s\x1b[0m', 'ℹ️ Telegram Bot startup is disabled (START_BOT=false).');
  }
});

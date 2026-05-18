const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

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

function createPlayer(socketId, name, chips) {
  return { id: socketId, name, chips, ante: false, bet: 0, isReady: false };
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

  // ── Create Room ──
  socket.on('create_room', ({ name, chips, anteAmount }) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const room = createRoom(roomId, name);
    room.anteAmount = anteAmount || 10;
    room.initialAnteAmount = anteAmount || 10;
    const player = createPlayer(socket.id, name, chips || 100);
    room.players.push(player);
    room.host = socket.id;
    rooms[roomId] = room;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.emit('room_created', { roomId });
    emitRoom(roomId);
  });

  // ── Join Room ──
  socket.on('join_room', ({ roomId, name, chips }) => {
    const room = rooms[roomId];
    if (!room) { socket.emit('error_msg', { key: 'err_room_not_found' }); return; }
    if (room.phase !== 'waiting' && room.phase !== 'ante') { socket.emit('error_msg', { key: 'err_game_in_progress' }); return; }
    if (room.players.length >= 6) { socket.emit('error_msg', { key: 'err_room_full' }); return; }
    const existing = room.players.find(p => p.id === socket.id);
    if (!existing) {
      const player = createPlayer(socket.id, name, chips || 100);
      room.players.push(player);
    }
    socket.join(roomId);
    socket.data.roomId = roomId;
    addMessage(room, { key: 'log_player_joined', name }, 'join');
    emitRoom(roomId);
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
  socket.on('start_demo', ({ name, chips }) => {
    const roomId = 'demo_' + socket.id;
    const room = createRoom(roomId, name);
    room.anteAmount = 10;
    room.initialAnteAmount = 10;
    const human = createPlayer(socket.id, name || 'You', chips || 100);
    const bot = createPlayer('bot', '🤖 Computer', 100);
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
  });

  // ── Ante ──
  socket.on('ante', () => {
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

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) {
      delete rooms[roomId];
    } else {
      if (room.host === socket.id) room.host = room.players[0].id;
      addMessage(room, { key: 'log_player_left' }, 'system');
      emitRoom(roomId);
    }
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
  addMessage(room, { key: 'log_deal_turn', name: currentPlayer.name, c1: c1.rank+c1.suit, c2: c2.rank+c2.suit }, 'deal');

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

function resolveRound(room, roomId) {
  const [c1, c2, c3] = room.tableCards;
  const result = evaluateResult(c1, c2, c3);
  const currentPlayer = room.players[room.currentPlayerIndex];
  const bet = room.currentBet;

  if (bet === 0) {
    // Passed — no money exchange
    room.lastResult = { result: 'pass', player: currentPlayer.name, playerId: currentPlayer.id, bet: 0, card: c3 };
    addMessage(room, { key: 'log_pass_result', name: currentPlayer.name }, 'pass');
  } else if (result === 'win') {
    currentPlayer.chips += bet;
    room.pot -= bet;
    room.lastResult = { result: 'win', player: currentPlayer.name, playerId: currentPlayer.id, bet, card: c3 };
    addMessage(room, { key: 'log_win_result', name: currentPlayer.name, amount: bet, card: c3.rank+c3.suit }, 'win');
  } else if (result === 'replay') {
    room.lastResult = { result: 'replay', player: currentPlayer.name, playerId: currentPlayer.id, bet, card: c3 };
    addMessage(room, { key: 'log_replay_result', name: currentPlayer.name, card: c3.rank+c3.suit }, 'post');
  } else {
    currentPlayer.chips -= bet;
    room.pot += bet;
    room.lastResult = { result: 'lose', player: currentPlayer.name, playerId: currentPlayer.id, bet, card: c3 };
    addMessage(room, { key: 'log_lose_result', name: currentPlayer.name, amount: bet, card: c3.rank+c3.suit }, 'lose');
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

function nextTurn(room, roomId) {
  // Remove broke players
  room.players = room.players.filter(p => p.chips > 0);
  if (room.players.length <= 1) {
    room.phase = 'gameover';
    if (room.players.length === 1) {
      room.players[0].chips += room.pot;
      room.pot = 0;
      addMessage(room, { key: 'log_player_wins_game', name: room.players[0].name }, 'win');
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
server.listen(PORT, () => console.log(`Bankeru running at http://localhost:${PORT}`));

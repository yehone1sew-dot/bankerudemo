const { makeDeck } = require('./GameEngine');
const config = require('../config');

function generateRoomId() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function createRoom(roomId, mode = 'classic') {
  return {
    id: roomId,
    mode,
    players: [],
    host: null,
    deck: makeDeck(),
    pot: 0,
    anteAmount: config.DEFAULT_ANTE,
    initialAnteAmount: config.DEFAULT_ANTE,
    currentPlayerIndex: 0,
    phase: 'waiting',   // waiting | ante | deal1 | bet | deal3 | result | gameover
    tableCards: [],
    currentBet: 0,
    lastResult: null,
    messages: [],
    round: 0,
  };
}

function createPlayer(socketId, name, chips, dbUserId = null) {
  return { id: socketId, name, chips, ante: false, bet: 0, isReady: false, dbUserId, streak: 0 };
}

function addMessage(room, msgData, type = 'info') {
  const text = typeof msgData === 'string' ? msgData : msgData.key;
  room.messages.push({
    text,
    msgData: typeof msgData === 'object' ? msgData : null,
    type,
    ts: Date.now(),
  });
}

function sanitizeRoom(room) {
  return {
    id: room.id,
    mode: room.mode || 'classic',
    players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, ante: p.ante, streak: p.streak || 0 })),
    pot: room.pot,
    anteAmount: room.anteAmount,
    currentPlayerIndex: room.currentPlayerIndex,
    phase: room.phase,
    tableCards: room.tableCards,
    currentBet: room.currentBet,
    lastResult: room.lastResult,
    messages: room.messages.slice(-config.LOG_LIMIT),
    round: room.round,
    host: room.host,
  };
}

module.exports = { generateRoomId, createRoom, createPlayer, addMessage, sanitizeRoom };

const config = require('../config');
const engine = require('../game/GameEngine');
const roomMgr = require('../game/RoomManager');
const botStrategy = require('../game/BotStrategy');
const userRepo = require('../db/userRepository');
const walletRepo = require('../db/walletRepository');

class GameService {
  constructor(io) {
    this.io = io;
    this.rooms = {};
  }

  // ── Emit ──────────────────────────────────────────────────────────────

  emitRoom(roomId) {
    const room = this.rooms[roomId];
    if (!room) return;
    this.io.to(roomId).emit('room_update', roomMgr.sanitizeRoom(room));
  }

  // ── Profile ───────────────────────────────────────────────────────────

  async getProfile(telegramId, username) {
    const user = await userRepo.getOrCreate(telegramId, username);
    const platformBalance = await walletRepo.getBalance();
    return { user, platformBalance };
  }

  // ── Create Room ───────────────────────────────────────────────────────

  async createRoom(socketId, telegramId, name, buyIn, anteAmount, mode) {
    const dbUser = await userRepo.getOrCreate(telegramId, name);
    const buyInAmt = this._clampBuyIn(parseInt(buyIn, 10) || 200, dbUser.chips);
    await userRepo.deductChips(dbUser.id, buyInAmt);

    const roomId = roomMgr.generateRoomId();
    const room = roomMgr.createRoom(roomId, mode || 'classic');
    room.anteAmount = anteAmount || config.DEFAULT_ANTE;
    room.initialAnteAmount = anteAmount || config.DEFAULT_ANTE;
    room.players.push(roomMgr.createPlayer(socketId, dbUser.username, buyInAmt, dbUser.id));
    room.host = socketId;
    this.rooms[roomId] = room;

    return { roomId, dbUser };
  }

  // ── Join Room ─────────────────────────────────────────────────────────

  async joinRoom(socketId, telegramId, name, buyIn, roomId) {
    const room = this.rooms[roomId];
    if (!room) return { ok: false, error: 'err_room_not_found' };
    if (room.phase !== 'waiting' && room.phase !== 'ante')
      return { ok: false, error: 'err_game_in_progress' };
    if (room.players.length >= config.MAX_PLAYERS)
      return { ok: false, error: 'err_room_full' };

    const dbUser = await userRepo.getOrCreate(telegramId, name);
    const buyInAmt = this._clampBuyIn(parseInt(buyIn, 10) || 200, dbUser.chips);

    const existing = room.players.find(p => p.id === socketId);
    if (!existing) {
      await userRepo.deductChips(dbUser.id, buyInAmt);
      room.players.push(roomMgr.createPlayer(socketId, dbUser.username, buyInAmt, dbUser.id));
    } else {
      const diff = buyInAmt - existing.chips;
      if (diff > 0) await userRepo.deductChips(dbUser.id, diff);
      else if (diff < 0) await userRepo.refundChips(dbUser.id, -diff);
      existing.chips = buyInAmt;
      existing.dbUserId = dbUser.id;
    }

    roomMgr.addMessage(room, { key: 'log_player_joined', name: dbUser.username }, 'join');
    return { ok: true, dbUser };
  }

  // ── Start Demo ────────────────────────────────────────────────────────

  async startDemo(socketId, telegramId, name, buyIn) {
    const dbUser = await userRepo.getOrCreate(telegramId, name);
    const buyInAmt = this._clampBuyIn(parseInt(buyIn, 10) || 200, dbUser.chips);
    await userRepo.deductChips(dbUser.id, buyInAmt);

    const roomId = 'demo_' + socketId;
    const room = roomMgr.createRoom(roomId, 'solo');
    room.anteAmount = config.DEFAULT_ANTE;
    room.initialAnteAmount = config.DEFAULT_ANTE;
    room.players.push(
      roomMgr.createPlayer(socketId, dbUser.username, buyInAmt, dbUser.id),
      roomMgr.createPlayer('bot', '🤖 Computer', 100, null)
    );
    room.host = socketId;
    this.rooms[roomId] = room;

    const minChips = Math.min(...room.players.map(p => p.chips));
    room.anteAmount = Math.min(room.initialAnteAmount, minChips);
    room.phase = 'ante';
    room.round = 1;
    roomMgr.addMessage(room, { key: 'log_demo_mode' }, 'system');

    setTimeout(() => this._autoAnte(room, 'bot'), config.TIMING.BOT_ANTE_MS);
    return { ok: true, roomId, dbUser };
  }

  // ── Start Game ────────────────────────────────────────────────────────

  startGame(roomId, socketId) {
    const room = this.rooms[roomId];
    if (!room || room.host !== socketId || room.players.length < 1) return { ok: false };

    const minChips = Math.min(...room.players.map(p => p.chips));
    room.anteAmount = Math.min(room.initialAnteAmount, minChips);
    room.phase = 'ante';
    room.round = 1;
    room.currentPlayerIndex = 0;
    room.pot = 0;
    room.players.forEach(p => { p.ante = false; });
    roomMgr.addMessage(room, { key: 'log_game_started' }, 'system');
    return { ok: true };
  }

  // ── Ante ──────────────────────────────────────────────────────────────

  processAnte(roomId, socketId) {
    const room = this.rooms[roomId];
    if (!room || room.phase !== 'ante') return { ok: false, error: 'err_invalid_action' };

    const player = room.players.find(p => p.id === socketId);
    if (!player || player.ante) return { ok: false, error: 'err_invalid_action' };
    if (player.chips < room.anteAmount) return { ok: false, error: 'err_not_enough_chips_ante' };

    player.chips -= room.anteAmount;
    player.ante = true;
    room.pot += room.anteAmount;
    roomMgr.addMessage(room, { key: 'log_player_anted', name: player.name, amount: room.anteAmount }, 'ante');

    if (room.players.every(p => p.ante)) this._startRound(room);
    return { ok: true };
  }

  // ── Place Bet ─────────────────────────────────────────────────────────

  processBet(roomId, socketId, betAmt) {
    const room = this.rooms[roomId];
    if (!room || room.phase !== 'bet') return { ok: false, error: 'err_invalid_action' };

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socketId) return { ok: false, error: 'err_not_your_turn' };
    if (betAmt > currentPlayer.chips) return { ok: false, error: 'err_not_enough_chips' };
    if (betAmt > room.pot) return { ok: false, error: 'err_max_bet' };

    currentPlayer.bet = betAmt;
    room.currentBet = betAmt;
    roomMgr.addMessage(room, { key: 'log_player_bet', name: currentPlayer.name, amount: betAmt }, 'bet');

    const { card, deck } = engine.dealCard(room.deck);
    room.deck = deck;
    room.tableCards.push(card);
    room.phase = 'deal3';

    setTimeout(() => this._resolveRound(room), config.TIMING.REVEAL_MS);
    return { ok: true };
  }

  // ── Pass ──────────────────────────────────────────────────────────────

  processPass(roomId, socketId) {
    const room = this.rooms[roomId];
    if (!room || room.phase !== 'bet') return { ok: false, error: 'err_invalid_action' };

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socketId) return { ok: false, error: 'err_not_your_turn' };

    currentPlayer.bet = 0;
    room.currentBet = 0;
    roomMgr.addMessage(room, { key: 'log_player_passed', name: currentPlayer.name }, 'pass');

    const { card, deck } = engine.dealCard(room.deck);
    room.deck = deck;
    room.tableCards.push(card);
    room.phase = 'deal3';

    setTimeout(() => this._resolveRound(room), config.TIMING.REVEAL_MS);
    return { ok: true };
  }

  // ── Leave Room ────────────────────────────────────────────────────────

  async leaveRoom(roomId, socketId) {
    const room = this.rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socketId);
    if (player?.dbUserId && player.chips > 0) {
      try {
        await userRepo.refundChips(player.dbUserId, player.chips);
      } catch (e) {
        console.error('Failed to refund chips on leave:', e);
      }
    }

    room.players = room.players.filter(p => p.id !== socketId);

    if (room.players.length === 0) {
      delete this.rooms[roomId];
      return;
    }

    if (room.host === socketId) room.host = room.players[0].id;
    roomMgr.addMessage(room, { key: 'log_player_left' }, 'system');
    this.emitRoom(roomId);
  }

  // ── Private: Auto Ante ────────────────────────────────────────────────

  _autoAnte(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    if (!player || player.ante || room.phase !== 'ante') return;
    if (player.chips < room.anteAmount) return;

    player.chips -= room.anteAmount;
    player.ante = true;
    room.pot += room.anteAmount;
    roomMgr.addMessage(room, { key: 'log_player_anted', name: player.name, amount: room.anteAmount }, 'ante');

    if (room.players.every(p => p.ante)) this._startRound(room);
    this.emitRoom(room.id);
  }

  // ── Private: Start Round ──────────────────────────────────────────────

  _startRound(room) {
    room.tableCards = [];
    room.lastResult = null;

    const { card: c1, deck: d1 } = engine.dealCard(room.deck);
    room.deck = d1;
    const { card: c2, deck: d2 } = engine.dealCard(room.deck);
    room.deck = d2;

    room.tableCards = [c1, c2];
    room.phase = 'bet';

    const currentPlayer = room.players[room.currentPlayerIndex];
    roomMgr.addMessage(room, {
      key: 'log_deal_turn',
      name: currentPlayer.name,
      c1: c1.rank + c1.suit,
      c2: c2.rank + c2.suit,
    }, 'deal');

    if (currentPlayer.id === 'bot') {
      setTimeout(() => this._botTurn(room), config.TIMING.BOT_BET_MS);
    }
  }

  // ── Private: Bot Turn ─────────────────────────────────────────────────

  _botTurn(room) {
    if (!this.rooms[room.id]) return;
    const bot = room.players.find(p => p.id === 'bot');
    if (!bot) return;

    const bet = botStrategy.decide({ tableCards: room.tableCards, pot: room.pot, chips: bot.chips });
    bot.bet = bet;
    room.currentBet = bet;

    const msgData = bet === 0 ? { key: 'log_bot_passes' } : { key: 'log_bot_bets', amount: bet };
    roomMgr.addMessage(room, msgData, bet === 0 ? 'pass' : 'bet');

    const { card, deck } = engine.dealCard(room.deck);
    room.deck = deck;
    room.tableCards.push(card);
    room.phase = 'deal3';
    this.emitRoom(room.id);

    setTimeout(() => this._resolveRound(room), config.TIMING.REVEAL_MS);
  }

  // ── Private: Resolve Round ────────────────────────────────────────────

  async _resolveRound(room) {
    if (!this.rooms[room.id]) return;

    const [c1, c2, c3] = room.tableCards;
    const result = engine.evaluateResult(c1, c2, c3);
    const currentPlayer = room.players[room.currentPlayerIndex];
    const bet = room.currentBet;

    if (bet === 0) {
      currentPlayer.streak = 0;
      room.lastResult = { result: 'pass', player: currentPlayer.name, playerId: currentPlayer.id, bet: 0, card: c3, streak: 0 };
      roomMgr.addMessage(room, { key: 'log_pass_result', name: currentPlayer.name }, 'pass');
    } else if (result === 'win') {
      const platformFee = Math.floor(bet * config.PLATFORM_FEE_RATE);
      const netWin = bet - platformFee;
      currentPlayer.chips += netWin;
      room.pot -= bet;
      currentPlayer.streak = (currentPlayer.streak || 0) + 1;

      if (currentPlayer.dbUserId) {
        try {
          await userRepo.recordWin(currentPlayer.dbUserId);
          await walletRepo.addFee(platformFee);
        } catch (e) {
          console.error('DB error on win:', e);
        }
      }

      room.lastResult = { result: 'win', player: currentPlayer.name, playerId: currentPlayer.id, bet: netWin, card: c3, streak: currentPlayer.streak };
      roomMgr.addMessage(room, { key: 'log_win_result', name: currentPlayer.name, amount: netWin, card: c3.rank + c3.suit }, 'win');
    } else if (result === 'replay') {
      room.lastResult = { result: 'replay', player: currentPlayer.name, playerId: currentPlayer.id, bet, card: c3, streak: currentPlayer.streak || 0 };
      roomMgr.addMessage(room, { key: 'log_replay_result', name: currentPlayer.name, card: c3.rank + c3.suit }, 'post');
    } else {
      currentPlayer.chips -= bet;
      room.pot += bet;
      currentPlayer.streak = 0;

      if (currentPlayer.dbUserId) {
        try {
          await userRepo.recordLoss(currentPlayer.dbUserId);
        } catch (e) {
          console.error('DB error on loss:', e);
        }
      }

      room.lastResult = { result: 'lose', player: currentPlayer.name, playerId: currentPlayer.id, bet, card: c3, streak: 0 };
      roomMgr.addMessage(room, { key: 'log_lose_result', name: currentPlayer.name, amount: bet, card: c3.rank + c3.suit }, 'lose');
    }

    room.phase = 'result';
    this.emitRoom(room.id);

    setTimeout(async () => {
      if (!this.rooms[room.id]) return;
      if (result === 'replay') {
        this._startRound(room);
        this.emitRoom(room.id);
      } else {
        await this._nextTurn(room);
      }
    }, config.TIMING.NEXT_TURN_MS);
  }

  // ── Private: Next Turn ────────────────────────────────────────────────

  async _nextTurn(room) {
    room.players = room.players.filter(p => p.chips > 0);

    if (room.players.length <= 1) {
      room.phase = 'gameover';

      if (room.players.length === 1) {
        const winner = room.players[0];
        const platformFee = Math.floor(room.pot * config.PLATFORM_FEE_RATE);
        const netWin = room.pot - platformFee;
        winner.chips += netWin;
        room.pot = 0;

        if (winner.dbUserId) {
          try {
            await userRepo.recordWin(winner.dbUserId);
            await walletRepo.addFee(platformFee);
          } catch (e) {
            console.error('DB error on game win:', e);
          }
        }

        roomMgr.addMessage(room, { key: 'log_player_wins_game', name: winner.name }, 'win');
        roomMgr.addMessage(room, { key: 'status_win', name: winner.name, amount: netWin }, 'win');
      }

      this.emitRoom(room.id);
      return;
    }

    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    room.round++;

    const minChips = Math.min(...room.players.map(p => p.chips));
    room.anteAmount = Math.min(room.initialAnteAmount, minChips);

    const needsReAnte =
      room.pot < room.anteAmount * room.players.length ||
      room.round % config.TIMING.RE_ANTE_INTERVAL === 0;

    if (needsReAnte) {
      room.phase = 'ante';
      room.players.forEach(p => { p.ante = false; });
      roomMgr.addMessage(room, { key: 'log_new_round', amount: room.anteAmount }, 'system');
      this.emitRoom(room.id);

      const bot = room.players.find(p => p.id === 'bot');
      if (bot) setTimeout(() => this._autoAnte(room, 'bot'), config.TIMING.BOT_ANTE_MS);
    } else {
      this._startRound(room);
      this.emitRoom(room.id);
    }
  }

  // ── Theme Store ───────────────────────────────────────────────────────

  async setTheme(userId, themeId) {
    if (!config.THEMES[themeId]) return { ok: false, error: 'err_invalid_theme' };
    const user = await userRepo.getById(userId);
    if (!user) return { ok: false, error: 'err_user_not_found' };
    const unlocked = JSON.parse(user.unlocked_themes || '["casino","midnight"]');
    if (!unlocked.includes(themeId)) return { ok: false, error: 'err_theme_not_owned' };
    await userRepo.setTheme(userId, themeId);
    return { ok: true, themeId };
  }

  async purchaseTheme(userId, themeId) {
    const themeCfg = config.THEMES[themeId];
    if (!themeCfg) return { ok: false, error: 'err_invalid_theme' };
    if (themeCfg.price === 0) return { ok: false, error: 'err_theme_already_free' };
    try {
      const updatedUser = await userRepo.unlockTheme(userId, themeId, themeCfg.price);
      return { ok: true, user: updatedUser };
    } catch (e) {
      const error = e.message === 'Insufficient chips' ? 'err_not_enough_chips' : 'err_purchase_failed';
      return { ok: false, error };
    }
  }

  // ── Private: Helpers ──────────────────────────────────────────────────

  _clampBuyIn(buyIn, maxChips) {
    return Math.max(config.MIN_BUY_IN, Math.min(buyIn, maxChips));
  }
}

module.exports = GameService;

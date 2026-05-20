module.exports = function registerGameHandlers(io, socket, gameService) {

  // ── Profile ───────────────────────────────────────────────────────────
  socket.on('get_profile', async ({ telegramId, username }) => {
    try {
      const { user, platformBalance } = await gameService.getProfile(telegramId, username);
      socket.data.dbUser = user;
      socket.emit('profile_loaded', { user, platformBalance });
    } catch (e) {
      console.error('get_profile error:', e);
      socket.emit('error_msg', { key: 'err_profile_load' });
    }
  });

  // ── Create Room ───────────────────────────────────────────────────────
  socket.on('create_room', async ({ name, buyIn, anteAmount }) => {
    try {
      const telegramId = socket.data.dbUser?.telegram_id || null;
      const { roomId, dbUser } = await gameService.createRoom(socket.id, telegramId, name, buyIn, anteAmount);
      socket.data.dbUser = dbUser;
      socket.data.roomId = roomId;
      socket.join(roomId);
      socket.emit('room_created', { roomId });
      gameService.emitRoom(roomId);
    } catch (e) {
      console.error('create_room error:', e);
      socket.emit('error_msg', { key: 'err_create_room' });
    }
  });

  // ── Join Room ─────────────────────────────────────────────────────────
  socket.on('join_room', async ({ roomId, name, buyIn }) => {
    try {
      const telegramId = socket.data.dbUser?.telegram_id || null;
      const result = await gameService.joinRoom(socket.id, telegramId, name, buyIn, roomId);
      if (!result.ok) return socket.emit('error_msg', { key: result.error });
      socket.data.dbUser = result.dbUser;
      socket.data.roomId = roomId;
      socket.join(roomId);
      gameService.emitRoom(roomId);
    } catch (e) {
      console.error('join_room error:', e);
      socket.emit('error_msg', { key: 'err_join_room' });
    }
  });

  // ── Start Demo ────────────────────────────────────────────────────────
  socket.on('start_demo', async ({ name, buyIn }) => {
    try {
      const telegramId = socket.data.dbUser?.telegram_id || null;
      const result = await gameService.startDemo(socket.id, telegramId, name, buyIn);
      if (!result.ok) return socket.emit('error_msg', { key: 'err_start_demo' });
      socket.data.dbUser = result.dbUser;
      socket.data.roomId = result.roomId;
      socket.join(result.roomId);
      gameService.emitRoom(result.roomId);
    } catch (e) {
      console.error('start_demo error:', e);
      socket.emit('error_msg', { key: 'err_start_demo' });
    }
  });

  // ── Start Game ────────────────────────────────────────────────────────
  socket.on('start_game', () => {
    const roomId = socket.data.roomId;
    const result = gameService.startGame(roomId, socket.id);
    if (result.ok) gameService.emitRoom(roomId);
  });

  // ── Ante ──────────────────────────────────────────────────────────────
  socket.on('ante', () => {
    const roomId = socket.data.roomId;
    const result = gameService.processAnte(roomId, socket.id);
    if (!result.ok) return socket.emit('error_msg', { key: result.error });
    gameService.emitRoom(roomId);
  });

  // ── Place Bet ─────────────────────────────────────────────────────────
  socket.on('place_bet', ({ bet }) => {
    const betAmt = parseInt(bet, 10);
    if (isNaN(betAmt) || betAmt < 0) return socket.emit('error_msg', { key: 'err_invalid_bet' });
    const roomId = socket.data.roomId;
    const result = gameService.processBet(roomId, socket.id, betAmt);
    if (!result.ok) return socket.emit('error_msg', { key: result.error });
    gameService.emitRoom(roomId);
  });

  // ── Pass ──────────────────────────────────────────────────────────────
  socket.on('pass', () => {
    const roomId = socket.data.roomId;
    const result = gameService.processPass(roomId, socket.id);
    if (!result.ok) return socket.emit('error_msg', { key: result.error });
    gameService.emitRoom(roomId);
  });

  // ── Theme Store ───────────────────────────────────────────────────────
  socket.on('set_theme', async ({ themeId }) => {
    const userId = socket.data.dbUser?.id;
    if (!userId) return socket.emit('error_msg', { key: 'err_not_logged_in' });
    const result = await gameService.setTheme(userId, themeId);
    if (!result.ok) return socket.emit('error_msg', { key: result.error });
    socket.emit('theme_set', { themeId });
  });

  socket.on('purchase_theme', async ({ themeId }) => {
    const userId = socket.data.dbUser?.id;
    if (!userId) return socket.emit('error_msg', { key: 'err_not_logged_in' });
    const result = await gameService.purchaseTheme(userId, themeId);
    if (!result.ok) return socket.emit('error_msg', { key: result.error });
    socket.data.dbUser = result.user;
    socket.emit('theme_purchased', {
      themeId,
      chips: result.user.chips,
      unlockedThemes: JSON.parse(result.user.unlocked_themes || '["casino","midnight"]'),
    });
  });

  // ── Leave / Disconnect ────────────────────────────────────────────────
  async function handleLeave() {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    await gameService.leaveRoom(roomId, socket.id);
    socket.leave(roomId);
    delete socket.data.roomId;
  }

  socket.on('leave_room', handleLeave);
  socket.on('disconnect', handleLeave);
};

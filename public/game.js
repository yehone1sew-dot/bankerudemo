/* ══════════════════════════════════════════════════════════════════
   Bankeru – In-Between Card Game  |  game.js
══════════════════════════════════════════════════════════════════ */

const socket = io();

// ── State ─────────────────────────────────────────────────────────
let mySocketId = null;
let myRoomId = null;
let myName = '';
let myChips = 100;
let roomState = null;
let currentLang = 'en';

// ── DOM Helpers ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(name).classList.add('active');
}

function showError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── Translation ───────────────────────────────────────────────────
function t(key, args = {}) {
  const dict = locales[currentLang] || locales['en'];
  let str = dict[key] || locales['en'][key] || key;
  for (const [k, v] of Object.entries(args)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.innerHTML = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });

  if (roomState) {
    // Re-render UI elements that rely on translations
    const log = $('gameLog');
    log.innerHTML = '';
    log.dataset.count = '0';
    renderLog(roomState);
    renderPlayers(roomState);
    renderStatus(roomState);
    renderControls(roomState);
    renderResult(roomState);
    if (roomState.phase === 'gameover') renderGameOver(roomState);
  }
}

let telegramUser = null;

function requestUserProfile() {
  const name = $('playerName').value.trim() || 'Player';
  localStorage.setItem('bankeru_username', name);
  
  socket.emit('get_profile', {
    telegramId: telegramUser ? telegramUser.id : null,
    username: name
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Telegram Mini App Initialization
  if (window.Telegram && window.Telegram.WebApp) {
    try {
      const tg = window.Telegram.WebApp;
      tg.expand();
      telegramUser = tg.initDataUnsafe?.user;
      if (telegramUser && telegramUser.first_name) {
        const username = telegramUser.username || telegramUser.first_name;
        $('playerName').value = username;
        $('playerName').readOnly = true;
        $('playerName').style.opacity = '0.7';
      }
    } catch (e) {
      console.error('Telegram WebApp error', e);
    }
  }

  // Local storage fallback for non-telegram browsers
  if (!telegramUser) {
    const savedName = localStorage.getItem('bankeru_username');
    if (savedName) {
      $('playerName').value = savedName;
    }
  }

  // Request profile on load (if connected)
  if (socket.connected) {
    requestUserProfile();
  }

  // Sync profile when playerName input changes
  $('playerName').addEventListener('change', () => {
    if (!telegramUser) {
      requestUserProfile();
    }
  });

  applyTranslations();
});

$('langSelect').addEventListener('change', (e) => {
  currentLang = e.target.value;
  applyTranslations();
});

// ── Lobby ─────────────────────────────────────────────────────────
$('btnDemo').addEventListener('click', () => {
  myName = $('playerName').value.trim() || 'Player';
  const buyIn = parseInt($('buyInAmount').value, 10) || 200;
  if (buyIn > myChips) { showError('lobbyError', `Not enough chips! Your wallet has ${myChips}.`); return; }
  if (buyIn < 10) { showError('lobbyError', 'Minimum buy-in is 10 chips.'); return; }
  socket.emit('start_demo', { name: myName, buyIn });
});

$('btnCreate').addEventListener('click', () => {
  myName = $('playerName').value.trim() || 'Player';
  const buyIn = parseInt($('buyInAmount').value, 10) || 200;
  if (buyIn > myChips) { showError('lobbyError', `Not enough chips! Your wallet has ${myChips}.`); return; }
  if (buyIn < 10) { showError('lobbyError', 'Minimum buy-in is 10 chips.'); return; }
  socket.emit('create_room', { name: myName, buyIn });
});

$('btnJoin').addEventListener('click', joinRoom);
$('joinCode').addEventListener('keydown', e => e.key === 'Enter' && joinRoom());

function joinRoom() {
  const code = $('joinCode').value.trim().toUpperCase();
  if (!code) { showError('lobbyError', 'Enter a room code!'); return; }
  myName = $('playerName').value.trim() || 'Player';
  const buyIn = parseInt($('buyInAmount').value, 10) || 200;
  if (buyIn > myChips) { showError('lobbyError', `Not enough chips! Your wallet has ${myChips}.`); return; }
  if (buyIn < 10) { showError('lobbyError', 'Minimum buy-in is 10 chips.'); return; }
  socket.emit('join_room', { roomId: code, name: myName, buyIn });
}

// ── Waiting Room ──────────────────────────────────────────────────
$('btnStartGame').addEventListener('click', () => {
  const ante = parseInt($('anteInput').value) || 10;
  socket.emit('start_game', { anteAmount: ante });
});

$('btnLeaveWaiting').addEventListener('click', () => {
  socket.emit('leave_room');
  showScreen('lobby');
  resetUI();
});

$('btnCopyCode').addEventListener('click', () => {
  navigator.clipboard.writeText(myRoomId).then(() => {
    $('btnCopyCode').textContent = '✅';
    setTimeout(() => ($('btnCopyCode').textContent = '📋'), 1500);
  });
});

// ── Game Controls ─────────────────────────────────────────────────
$('btnAnte').addEventListener('click', () => socket.emit('ante'));
$('btnPass').addEventListener('click', () => socket.emit('pass'));

$('btnBet').addEventListener('click', () => {
  const bet = parseInt($('betSlider').value);
  socket.emit('place_bet', { bet });
});

$('btnHalfPot').addEventListener('click', () => {
  if (!roomState) return;
  const half = Math.floor(roomState.pot / 2);
  setSliderMax(roomState);
  $('betSlider').value = half;
  updateBetDisplay();
});

$('btnFullPot').addEventListener('click', () => {
  if (!roomState) return;
  setSliderMax(roomState);
  $('betSlider').value = roomState.pot;
  updateBetDisplay();
});

$('betSlider').addEventListener('input', updateBetDisplay);

function updateBetDisplay() {
  const v = parseInt($('betSlider').value) || 0;
  $('betDisplay').textContent = v;
  // Update slider gradient
  const slider = $('betSlider');
  const max = parseInt(slider.max) || 1;
  const pct = (v / max) * 100;
  slider.style.background = `linear-gradient(to right, var(--gold) ${pct}%, rgba(255,255,255,.15) ${pct}%)`;

  const btnBet = $('btnBet');
  if (v === 0) {
    btnBet.disabled = true;
    btnBet.style.opacity = '0.5';
    btnBet.style.cursor = 'not-allowed';
  } else {
    btnBet.disabled = false;
    btnBet.style.opacity = '1';
    btnBet.style.cursor = 'pointer';
  }
}

function setSliderMax(room) {
  const me = room.players.find(p => p.id === mySocketId);
  const max = me ? Math.min(room.pot, me.chips) : room.pot;
  $('betSlider').max = max;
  $('betSlider').min = 0;
}

$('btnLeaveGame').addEventListener('click', () => {
  socket.emit('leave_room');
  showScreen('lobby');
  resetUI();
});

$('btnPlayAgain').addEventListener('click', () => {
  socket.emit('leave_room');
  showScreen('lobby');
  resetUI();
});

$('btnBackLobby').addEventListener('click', () => {
  socket.emit('leave_room');
  showScreen('lobby');
  resetUI();
});

// ── Socket Events ─────────────────────────────────────────────────
socket.on('connect', () => { 
  mySocketId = socket.id; 
  requestUserProfile();
});

socket.on('profile_loaded', ({ user }) => {
  myChips = user.chips;
  $('lobbyChips').textContent = `💰 ${user.chips.toLocaleString()}`;
  $('lobbyStats').textContent = `🏆 ${user.wins} W / ${user.losses} L`;
});

socket.on('room_created', ({ roomId }) => {
  myRoomId = roomId;
  $('roomCodeDisplay').textContent = roomId;
  $('headerRoomCode').textContent = roomId;
  showScreen('waiting');
});

socket.on('error_msg', msg => {
  showError('lobbyError', msg.key ? t(msg.key, msg) : t(msg));
});

socket.on('room_update', state => {
  roomState = state;
  myRoomId = state.id;

  const isDemo = state.id.startsWith('demo_');

  // Route to correct screen
  if (state.phase === 'waiting') {
    renderWaiting(state);
    showScreen('waiting');
  } else if (state.phase === 'gameover') {
    renderGameOver(state);
    showScreen('gameover');
  } else if (isDemo && state.phase === 'ante') {
    // In demo, go straight to game and handle ante there
    showScreen('game');
    renderGame(state);
  } else if (state.phase === 'ante' || state.phase === 'bet' ||
    state.phase === 'deal1' || state.phase === 'deal3' || state.phase === 'result') {
    showScreen('game');
    renderGame(state);
  } else {
    renderWaiting(state);
    showScreen('waiting');
  }
});

// ── Render: Waiting Room ──────────────────────────────────────────
function renderWaiting(state) {
  $('roomCodeDisplay').textContent = state.id;
  $('headerRoomCode').textContent = state.id;

  const isHost = state.host === mySocketId;
  $('hostControls').classList.toggle('hidden', !isHost);

  const container = $('waitingPlayers');
  container.innerHTML = '';
  state.players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'waiting-player-row';
    div.innerHTML = `
      <span>${p.name}</span>
      ${p.id === state.host ? `<span class="player-badge">${t('tag_host')}</span>` : ''}
    `;
    container.appendChild(div);
  });
}

// ── Render: Game ──────────────────────────────────────────────────
function renderGame(state) {
  // Header
  $('headerRoomCode').textContent = state.id.startsWith('demo_') ? 'DEMO' : state.id;
  $('potAmount').textContent = state.pot;

  // My chips
  const me = state.players.find(p => p.id === mySocketId);
  if (me) {
    myChips = me.chips;
    $('myChipsDisplay').textContent = `💰 ${me.chips}`;
  }

  // Players list
  renderPlayers(state);

  // Cards
  renderCards(state);

  // Status
  renderStatus(state);

  // Controls
  renderControls(state);

  // Log
  renderLog(state);

  // Result overlay
  renderResult(state);
}

function renderPlayers(state) {
  const list = $('playersList');
  list.innerHTML = '';
  state.players.forEach((p, i) => {
    const isActive = i === state.currentPlayerIndex;
    const isMe = p.id === mySocketId;
    const div = document.createElement('div');
    div.className = `player-card${isActive ? ' active' : ''}${isMe ? ' current-user' : ''}`;
    div.innerHTML = `
      <div class="pc-name">${p.id === 'bot' ? t('tag_bot') : isMe ? t('tag_me') : ''}${p.name}</div>
      <div class="pc-chips">💰 ${p.chips}</div>
      <div class="pc-status">${p.ante ? t('tag_anted') : ''}</div>
      ${isActive && (state.phase === 'bet' || state.phase === 'deal3' || state.phase === 'result') ? `<div class="pc-turn-tag">${t('tag_turn')}</div>` : ''}
    `;
    list.appendChild(div);
  });
}

function renderCards(state) {
  const c1Slot = $('card1Slot');
  const c2Slot = $('card2Slot');
  const c3Slot = $('card3Slot');

  const [c1, c2, c3] = state.tableCards;

  c1Slot.innerHTML = c1 ? buildCard(c1) : '<div class="card-placeholder">?</div>';
  c2Slot.innerHTML = c2 ? buildCard(c2) : '<div class="card-placeholder">?</div>';
  c3Slot.innerHTML = c3 ? buildCard(c3, true) : '<div class="card-placeholder">?</div>';
}

function buildCard(card, isThird = false) {
  const color = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
  return `
    <div class="playing-card ${color}${isThird ? ' third' : ''}">
      <div class="card-corner top">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit-sm">${card.suit}</span>
      </div>
      <div class="card-center">${card.suit}</div>
      <div class="card-corner bottom">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit-sm">${card.suit}</span>
      </div>
    </div>`;
}

function renderStatus(state) {
  const banner = $('statusBanner');
  const cp = state.players[state.currentPlayerIndex];
  const cpName = cp ? cp.name : '';

  const msgs = {
    ante: t('status_ante', { amount: state.anteAmount }),
    bet: cp?.id === mySocketId ? t('status_bet_turn') : t('status_bet_wait', { name: cpName }),
    deal1: t('status_deal1'),
    deal3: t('status_deal3'),
    result: state.lastResult ? getResultMessage(state.lastResult) : '',
  };
  banner.textContent = msgs[state.phase] || '';
}

function getResultMessage(r) {
  if (r.result === 'win') return t('status_win', { name: r.player, amount: r.bet });
  if (r.result === 'replay') return t('status_replay', { name: r.player });
  if (r.result === 'lose') return t('status_lose', { name: r.player, amount: r.bet });
  if (r.result === 'pass') return t('status_pass', { name: r.player });
  return '';
}

function renderControls(state) {
  const me = state.players.find(p => p.id === mySocketId);
  const isMyTurn = me && state.players[state.currentPlayerIndex]?.id === mySocketId;
  const anteCtrl = $('anteControls');
  const betCtrl = $('betControls');
  const waitCtrl = $('waitingControls');
  const waitTxt = $('waitingText');

  // Hide all first
  anteCtrl.classList.add('hidden');
  betCtrl.classList.add('hidden');
  waitCtrl.style.display = 'flex';

  if (state.phase === 'ante') {
    if (me && !me.ante) {
      anteCtrl.classList.remove('hidden');
      waitCtrl.style.display = 'none';
    } else {
      waitTxt.textContent = me?.ante ? t('waiting_ante') : t('waiting_text');
    }
  } else if (state.phase === 'bet' && isMyTurn) {
    betCtrl.classList.remove('hidden');
    waitCtrl.style.display = 'none';
    setSliderMax(state);
    $('betSlider').value = 0;
    updateBetDisplay();
  } else if (state.phase === 'result' || state.phase === 'deal3') {
    waitTxt.textContent = state.phase === 'result' ? t('waiting_next_round') : t('waiting_reveal');
  } else if (state.phase === 'bet') {
    const cp = state.players[state.currentPlayerIndex];
    waitTxt.textContent = t('status_bet_wait', { name: cp?.name || 'player' });
  } else {
    waitTxt.textContent = t('waiting_text');
  }
}

function renderResult(state) {
  const overlay = $('resultOverlay');
  const rText = $('resultText');
  const rSub = $('resultSub');

  if (state.phase === 'result' && state.lastResult) {
    const r = state.lastResult;
    overlay.classList.remove('hidden');

    const classes = { win: 'win', lose: 'lose', replay: 'post', pass: 'pass' };
    const isMe = r.playerId === mySocketId;
    const suffix = isMe ? '_me' : '_other';

    rText.textContent = t('res_' + r.result + suffix, { name: r.player }) || '';
    rText.className = `result-text ${classes[r.result] || ''}`;

    const sub = r.result === 'win' ? t('res_sub_win', { amount: r.bet })
      : r.result === 'replay' ? t('res_sub_replay')
        : r.result === 'lose' ? t('res_sub_lose', { amount: r.bet })
          : t('res_sub_pass');
    rSub.textContent = `${r.player} · ${sub}`;
  } else {
    overlay.classList.add('hidden');
  }
}

function renderLog(state) {
  const log = $('gameLog');
  const msgs = state.messages || [];
  // Only re-render if changed
  const lastCount = parseInt(log.dataset.count || '0');
  if (msgs.length === lastCount) return;
  log.dataset.count = msgs.length;

  log.innerHTML = '';
  msgs.forEach(m => {
    const div = document.createElement('div');
    div.className = `log-entry ${m.type || ''}`;
    div.textContent = m.msgData ? t(m.msgData.key, m.msgData) : m.text;
    log.appendChild(div);
  });
  setTimeout(() => {
    log.scrollTop = log.scrollHeight;
  }, 10);
}

// ── Render: Game Over ─────────────────────────────────────────────
function renderGameOver(state) {
  const winner = state.players[0];
  $('gameoverTitle').textContent = winner ? t('log_player_wins_game', { name: winner.name }) : t('gameover_title');
  $('gameoverSub').textContent = t('gameover_sub');

  const scores = $('finalScores');
  scores.innerHTML = '';
  const sorted = [...state.players].sort((a, b) => b.chips - a.chips);
  sorted.forEach(p => {
    const div = document.createElement('div');
    div.className = 'final-row';
    div.innerHTML = `<span class="final-name">${p.name}</span><span class="final-chips">💰 ${p.chips}</span>`;
    scores.appendChild(div);
  });
}

function resetUI() {
  roomState = null;
  myRoomId = null;
  $('gameLog').innerHTML = '';
  $('gameLog').dataset.count = '0';
  $('playersList').innerHTML = '';
  $('card1Slot').innerHTML = '<div class="card-placeholder">?</div>';
  $('card2Slot').innerHTML = '<div class="card-placeholder">?</div>';
  $('card3Slot').innerHTML = '<div class="card-placeholder">?</div>';
  $('resultOverlay').classList.add('hidden');
  $('potAmount').textContent = '0';
  requestUserProfile();
}

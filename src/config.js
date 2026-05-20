module.exports = {
  PORT: process.env.PORT || 3000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  START_BOT: process.env.START_BOT !== 'false',

  PLATFORM_FEE_RATE: 0.05,
  MAX_PLAYERS: 6,
  MIN_BUY_IN: 10,
  DEFAULT_CHIPS: 1000,
  DEFAULT_ANTE: 10,
  LOG_LIMIT: 30,

  THEMES: {
    casino:   { price: 0 },
    midnight: { price: 0 },
    ember:    { price: 500 },
    ice:      { price: 500 },
    royal:    { price: 1000 },
  },
  DEFAULT_THEME: 'casino',

  TIMING: {
    BOT_ANTE_MS: 800,
    BOT_BET_MS: 1500,
    REVEAL_MS: 1200,
    NEXT_TURN_MS: 3000,
    RE_ANTE_INTERVAL: 10,
  },
};

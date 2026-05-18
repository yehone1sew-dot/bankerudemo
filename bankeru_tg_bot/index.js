require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

// Get the bot token from the .env file
const token = process.env.TELEGRAM_BOT_TOKEN;
// Get the Web App URL (the public URL where your Bankeru game is hosted)
// e.g., https://your-ngrok-url.ngrok-free.app
const webAppUrl = process.env.WEB_APP_URL || 'https://example.com';

if (!token || token === 'YOUR_TOKEN_HERE') {
  console.error('Error: Please set your TELEGRAM_BOT_TOKEN in the .env file.');
  process.exit(1);
}

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

// Self-healing conflict detector: Automatically stop local polling if production bot is active
bot.on('polling_error', (error) => {
  if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
    console.warn('\n\x1b[33m%s\x1b[0m', '⚠️ Telegram Bot polling conflict detected!');
    console.warn('\x1b[33m%s\x1b[0m', '  -> Your production bot (or another instance) is already running.');
    console.warn('\x1b[33m%s\x1b[0m', '  -> To avoid interfering with it, this local bot instance is stopping polling.');
    console.warn('\x1b[33m%s\x1b[0m', '  -> TIP: To test locally, set a separate test token in your bankeru_tg_bot/.env file.\n');
    
    bot.stopPolling()
      .then(() => {
        console.log('\x1b[32m%s\x1b[0m', 'ℹ️ Local bot polling stopped gracefully. Web server remains active.');
      })
      .catch((err) => {
        console.error('Error stopping bot polling:', err);
      });
  } else {
    console.error('Telegram Bot Polling Error:', error.message);
  }
});

console.log('Bankeru Telegram Bot is running...');

// Handle the /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, 'Welcome to Bankeru! 🃏\nClick the button below to launch the game.', {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Play Bankeru", web_app: { url: webAppUrl } }]
      ]
    }
  });
});

// Handle the /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Type /start to open the Bankeru game launcher.');
});

// Handle generic messages
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  
  // Ignore commands like /start
  if (msg.text && msg.text.startsWith('/')) return;

  bot.sendMessage(chatId, 'Welcome to Bankeru! Use the menu or type /start to launch the game.', {
    reply_markup: {
      keyboard: [
        [{ text: "Play Bankeru", web_app: { url: webAppUrl } }]
      ],
      resize_keyboard: true
    }
  });
});

/* ── Theme Definitions ─────────────────────────────────────────────── */

const THEMES = {
  casino: {
    id: 'casino',
    name: 'Casino Royale',
    emoji: '🃏',
    price: 0,
    description: 'Dark luxury. Gold accent on classic green felt.',
    preview: { bg: '#0a0e1a', accent: '#f5c842', felt: '#0d4f2e', felt2: '#0a3d22' },
    vars: {
      '--bg':    '#0a0e1a',
      '--bg2':   '#111827',
      '--gold':  '#f5c842',
      '--gold2': '#e6a817',
      '--felt':  '#0d4f2e',
      '--felt2': '#0a3d22',
      '--lobby-grad-a': '#1a0a2e',
      '--lobby-grad-b': '#0a1a2e',
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    emoji: '🌙',
    price: 0,
    description: 'Deep indigo. Violet accent on a dark cosmic felt.',
    preview: { bg: '#0d0a1e', accent: '#c084fc', felt: '#1a0f40', felt2: '#120b30' },
    vars: {
      '--bg':    '#0d0a1e',
      '--bg2':   '#17103a',
      '--gold':  '#c084fc',
      '--gold2': '#a855f7',
      '--felt':  '#1a0f40',
      '--felt2': '#120b30',
      '--lobby-grad-a': '#1a0a2e',
      '--lobby-grad-b': '#0a0a2e',
    },
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    emoji: '🔥',
    price: 500,
    description: 'Warm fire tones. Amber on a scorched brown felt.',
    preview: { bg: '#150a00', accent: '#f59e0b', felt: '#3d1a00', felt2: '#2d1200' },
    vars: {
      '--bg':    '#150a00',
      '--bg2':   '#1f1000',
      '--gold':  '#f59e0b',
      '--gold2': '#d97706',
      '--felt':  '#3d1a00',
      '--felt2': '#2d1200',
      '--lobby-grad-a': '#2a1000',
      '--lobby-grad-b': '#1a0a00',
    },
  },
  ice: {
    id: 'ice',
    name: 'Arctic',
    emoji: '🧊',
    price: 500,
    description: 'Cold and sharp. Cyan on a frozen deep-teal felt.',
    preview: { bg: '#040f1a', accent: '#06b6d4', felt: '#052535', felt2: '#031a26' },
    vars: {
      '--bg':    '#040f1a',
      '--bg2':   '#071825',
      '--gold':  '#06b6d4',
      '--gold2': '#0891b2',
      '--felt':  '#052535',
      '--felt2': '#031a26',
      '--lobby-grad-a': '#001a2e',
      '--lobby-grad-b': '#000e1a',
    },
  },
  royal: {
    id: 'royal',
    name: 'Royal',
    emoji: '👑',
    price: 1000,
    description: 'Velvet black throne. Vivid purple on a regal felt.',
    preview: { bg: '#0a0010', accent: '#a855f7', felt: '#1a0030', felt2: '#120020' },
    vars: {
      '--bg':    '#0a0010',
      '--bg2':   '#120018',
      '--gold':  '#a855f7',
      '--gold2': '#9333ea',
      '--felt':  '#1a0030',
      '--felt2': '#120020',
      '--lobby-grad-a': '#1a003a',
      '--lobby-grad-b': '#0a0020',
    },
  },
};

function applyTheme(themeId) {
  const theme = THEMES[themeId] || THEMES.casino;
  const root = document.documentElement;
  for (const [prop, val] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, val);
  }
  document.documentElement.dataset.theme = themeId;
  localStorage.setItem('bankeru_theme', themeId);
}

function getActiveTheme() {
  return localStorage.getItem('bankeru_theme') || 'casino';
}

# Bankeru Design System

**Direction:** Dark Luxury Casino — disciplined contrast, gold as the single accent, semantic color for outcomes only.

---

## Visual Direction

Bankeru lives inside Telegram's dark chrome. The aesthetic borrows from high-end casino interiors: deep navy-black backgrounds, green baize felt, gold as the prestige accent. Every color decision either marks ownership (gold), communicates an outcome (win / lose / replay / streak), or stays neutral. There is no decorative color.

Key principles:
- **One accent, used sparingly.** Gold appears on the primary CTA, active-turn indicator, pot display, and leaderboard chips only.
- **Outcome colors are semantic, not decorative.** Green = win, red = lose, orange = replay. Never invert this.
- **Depth through layering, not gradients.** Three background depths (`bg-0 → bg-1 → bg-2`) plus surface overlays create spatial hierarchy without decorative gradients.
- **Typography does the heavy lifting.** Font-weight contrast (400 body vs 900 display) replaces color as the primary hierarchy tool.

---

## Color Tokens

### Backgrounds
| Token | Value | Usage |
|-------|-------|-------|
| `bg-0` | `#07090f` | Page canvas — absolute floor |
| `bg-1` | `#0a0e1a` | App chrome, sidebars |
| `bg-2` | `#111827` | Secondary panels |
| `bg-surface` | `rgba(255,255,255,0.05)` | Cards, modals |
| `bg-surface-raised` | `rgba(255,255,255,0.08)` | Hover, active states |
| `bg-overlay` | `rgba(0,0,0,0.75)` | Modal backdrops |

### Gold (Primary Accent)
| Token | Value | Usage |
|-------|-------|-------|
| `gold-300` | `#fde68a` | Soft text, chip amounts |
| `gold-400` | `#f5c842` | Primary CTA, active turn, pot |
| `gold-500` | `#e6a817` | Pressed states, slider fill |
| `gold-600` | `#b07b0d` | Deep shadow reference |

### Semantic — Outcomes
| Token | Base | Dim | Glow | Usage |
|-------|------|-----|------|-------|
| win | `#22c55e` | `rgba(34,197,94,0.12)` | `rgba(34,197,94,0.45)` | Win events |
| lose | `#ef4444` | `rgba(239,68,68,0.12)` | `rgba(239,68,68,0.45)` | Loss events |
| replay | `#f97316` | `rgba(249,115,22,0.12)` | `rgba(249,115,22,0.45)` | Post hit |

### Streak Scale
| Token | Value | Trigger |
|-------|-------|---------|
| `streak-low` | `#fb923c` | 3× wins |
| `streak-mid` | `#f97316` | 5× wins |
| `streak-high` | `#ef4444` | 7× wins |
| `streak-legendary` | `#dc2626` | 10× wins — pulse animation |

### Rank (Leaderboard)
| Token | Value |
|-------|-------|
| `rank-gold` | `#f5c842` |
| `rank-silver` | `#94a3b8` |
| `rank-bronze` | `#cd7c3a` |

### Game Mode Colors
Each mode gets one color used only for its accent line, border, and name label:
| Mode | Color |
|------|-------|
| Classic | `#3b82f6` |
| Speed | `#f97316` |
| High Stakes | `#a855f7` |
| Tournament | `#ef4444` |
| Solo | `#22c55e` |

### Text
| Token | Value | Usage |
|-------|-------|-------|
| `text-primary` | `#f1f5f9` | All readable content |
| `text-secondary` | `#94a3b8` | Supporting labels |
| `text-muted` | `#475569` | Timestamps, metadata |
| `text-inverse` | `#0a0e1a` | Text on gold buttons |

### Felt (Card Table)
| Token | Value |
|-------|-------|
| `felt-base` | `#0d4f2e` |
| `felt-dark` | `#0a3d22` |
| `felt-rim` | `#082a17` |

---

## Typography

**Single typeface: Outfit.** Variable weight (400–900) provides all hierarchy. No secondary typeface.

| Step | Size | Weight | Tracking | Usage |
|------|------|--------|----------|-------|
| display | `clamp(56px, 14vw, 96px)` | 900 | −0.02em | Logo only |
| 3xl | `clamp(40px, 8vw, 64px)` | 900 | −0.02em | Event results (WIN / LOSE) |
| 2xl | `32px` | 900 | −0.02em | Chip amounts |
| xl | `24px` | 700 | 0 | Panel headers |
| lg | `20px` | 600 | 0 | Section titles |
| md | `17px` | 500 | 0 | Body emphasis |
| base | `15px` | 400 | 0 | Default body |
| sm | `13px` | 600 | +0.06em | Labels, uppercase badges |
| xs | `11px` | 600 | +0.20em | Eyebrow labels, timestamps |

---

## Spacing

4px base unit. All values are multiples of 4.

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | `8px` | Tags, log dots |
| `md` | `12px` | Playing cards |
| `lg` | `16px` | Player cards, mode cards |
| `xl` | `24px` | Panels, overlays |
| `full` | `9999px` | Buttons, badges, pills |

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `card` | `0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)` | Playing cards, panels |
| `glow-gold` | `0 0 40px rgba(245,200,66,0.45)` | Active CTA hover |
| `glow-win` | `0 0 40px rgba(34,197,94,0.50)` | Win overlay |
| `glow-lose` | `0 0 40px rgba(239,68,68,0.50)` | Lose overlay |
| `glow-replay` | `0 0 40px rgba(249,115,22,0.50)` | Replay overlay |
| `glow-streak` | `0 0 60px rgba(239,68,68,0.60), 0 0 120px rgba(245,158,11,0.30)` | Legendary streak |

---

## Animation

### Duration
| Token | Value | Usage |
|-------|-------|-------|
| `fast` | `150ms` | Hover micro-transitions |
| `normal` | `300ms` | State changes |
| `slow` | `500ms` | Entry animations |
| `dramatic` | `700ms` | Event overlays |

### Easing
| Token | Curve | Usage |
|-------|-------|-------|
| `out` | `cubic-bezier(0.16,1,0.3,1)` | Default exits — fast start, smooth settle |
| `bounce` | `cubic-bezier(0.34,1.56,0.64,1)` | Card hover, slider thumb, player avatar tap |
| `spring` | `cubic-bezier(0.43,0.195,0.020,1.0)` | Trophy reveal, streak milestone |

### Event Animation Signatures
- **WIN** — scale + translateY reveal (`scale(0.5) → scale(1)`, 600ms bounce)
- **LOSE** — horizontal shake (4-step, 500ms ease)
- **REPLAY** — 180° rotation reveal (500ms ease-out)
- **Streak milestone** — continuous pulse on the glow shadow (2s infinite)
- **Trophy (game over)** — translateY bounce from above with overshoot (1s spring)
- **Floating flame** — 6px vertical float, 1.5s ease-in-out infinite

---

## Card Dimensions
| Token | Value |
|-------|-------|
| `card-w` | `80px` |
| `card-h` | `112px` |
| `card-w-sm` | `64px` |
| `card-h-sm` | `92px` |

---

## Component Specifications

### Felt Table
Radial gradient from `felt-base` to `felt-dark`, 6px `felt-rim` border, 120px border-radius (rounded rectangle). Double-ring effect via `box-shadow` outline at 2px.

### Playing Cards
White face, `radius-md`, `shadow-card`. Red suits use `#dc2626`. Card back uses a deep navy diagonal gradient with a subtle inset frame. Hover: `translateY(-8px) rotate(-2deg)`.

### Bet Slider
Range input styled with gradient background tracking the thumb position. Thumb: gold disc with glow, scales 1.2× on hover.

### Mode Cards
Grid of 5. Each has a 2px top accent line in the mode color, revealed on hover and selection. Selected state adds a matching border and box-shadow glow. Click is interactive (JS selects one at a time).

### Streak Orb
Circular badge with radial gradient interior. Color and glow intensity scale with streak level. Legendary (10×) pulses the glow shadow on a 2s loop.

### Event Overlays
Full-bleed radial gradient backgrounds. Border color matches the semantic color at 35% opacity. Each has a unique entrance animation. They appear over the table during round resolution.

### Leaderboard Row
Flex row: rank circle → name → streak → chip count. Top 3 ranks use gold/silver/bronze ring styles. "You" row gets a left gold border accent and a subtle gold background tint.

### Game Log
Fixed-width list. Each entry has a colored dot (matching outcome), player name in bold, event description in secondary text, and a chip delta aligned right.

---

## Breakpoints

| Token | Value |
|-------|-------|
| `sm` | `520px` |
| `md` | `768px` |
| `lg` | `1024px` |

The primary surface is Telegram Mini App (mobile-first). At `md+`, the table and player grid can expand to multi-column.

---

## Files

| File | Purpose |
|------|---------|
| `design-tokens.json` | Source of truth for all token values |
| `design-preview.html` | Self-contained interactive preview — open in a browser |
| `DESIGN.md` | This document — rationale and usage rules |

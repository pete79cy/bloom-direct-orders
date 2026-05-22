import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', '"Cormorant Garamond"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        ios: {
          ink: 'var(--ink-900)',
          'ink-sec': 'var(--ink-500)',
          fill: 'var(--cream-100)',
          card: '#FFFFFF',
          tint: 'var(--sage-600)',
          green: 'var(--sage-600)',
          orange: 'var(--accent-honey)',
          red: 'var(--accent-clay)',
        },
        sage: {
          50:  'var(--sage-50)',
          100: 'var(--sage-100)',
          200: 'var(--sage-200)',
          300: 'var(--sage-300)',
          400: 'var(--sage-400)',
          500: 'var(--sage-500)',
          600: 'var(--sage-600)',
          700: 'var(--sage-700)',
          800: 'var(--sage-800)',
        },
        cream: {
          50:  'var(--cream-50)',
          100: 'var(--cream-100)',
          200: 'var(--cream-200)',
          300: 'var(--cream-300)',
        },
        ink: {
          900: 'var(--ink-900)',
          700: 'var(--ink-700)',
          500: 'var(--ink-500)',
          300: 'var(--ink-300)',
        },
        accent: {
          clay:  'var(--accent-clay)',
          honey: 'var(--accent-honey)',
        },
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      boxShadow: {
        'sheet': '0 -8px 32px -8px rgba(31, 51, 41, 0.18)',
        'card': '0 1px 2px rgba(31, 51, 41, 0.04), 0 4px 16px -8px rgba(31, 51, 41, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;

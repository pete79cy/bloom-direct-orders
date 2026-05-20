import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ios: {
          ink: 'rgb(28, 28, 30)',
          'ink-sec': 'rgb(99, 99, 102)',
          fill: 'rgb(242, 242, 247)',
          card: 'rgb(255, 255, 255)',
          tint: 'rgb(0, 122, 255)',
          green: 'rgb(52, 199, 89)',
          orange: 'rgb(255, 149, 0)',
          red: 'rgb(255, 59, 48)',
        },
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
} satisfies Config;

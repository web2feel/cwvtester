import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: { DEFAULT: '#e35a2a', dark: '#cc4d20', tint: '#fff1ea', tintBorder: '#fed7c3', tintText: '#c2410c' },
        surface: { page: '#fafafa', card: '#ffffff', muted: '#fafafa', muted2: '#f7f7f8', muted3: '#f0f0f1' },
        border: { card: '#ececec', inner: '#f4f4f5', control: '#e4e4e7', diag: '#eaeaeb' },
        text: {
          primary: '#18181b',
          secondary: '#3f3f46',
          tertiary: '#52525b',
          muted: '#71717a',
          faint: '#a1a1aa',
          faintest: '#c4c4c8',
        },
        good: { text: '#15803d', dot: '#16a34a', bg: '#ecfdf3', border: '#bbf7d0' },
        warn: { text: '#b45309', dot: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
        bad: { text: '#b91c1c', dot: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
        selection: '#fbd9c9',
      },
      borderRadius: { pill: '999px' },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04)',
        button: '0 1px 2px rgba(227,90,42,0.35)',
        tooltip: '0 12px 32px rgba(0,0,0,0.28)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        fadeIn: 'fadeIn 0.18s ease',
        fadeInFast: 'fadeIn 0.12s ease',
      },
      maxWidth: { content: '1160px' },
    },
  },
  plugins: [],
} satisfies Config;

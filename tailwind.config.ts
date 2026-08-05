import type { Config } from 'tailwindcss';

/**
 * Design tokens for "Nós".
 *
 * The palette is deliberately narrow: rice-paper ivory, ink black, one
 * disciplined cinnabar red, one quiet jade. Colours are declared as HSL
 * channel triplets in CSS custom properties (see src/styles/index.css) so the
 * same class names work in light and dark without a second palette.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: 'hsl(var(--paper) / <alpha-value>)',
        raised: 'hsl(var(--raised) / <alpha-value>)',
        sunk: 'hsl(var(--sunk) / <alpha-value>)',
        ink: 'hsl(var(--ink) / <alpha-value>)',
        'ink-soft': 'hsl(var(--ink-soft) / <alpha-value>)',
        'ink-faint': 'hsl(var(--ink-faint) / <alpha-value>)',
        rule: 'hsl(var(--rule) / <alpha-value>)',
        cinnabar: {
          DEFAULT: 'hsl(var(--cinnabar) / <alpha-value>)',
          soft: 'hsl(var(--cinnabar-soft) / <alpha-value>)',
          wash: 'hsl(var(--cinnabar-wash) / <alpha-value>)',
        },
        jade: {
          DEFAULT: 'hsl(var(--jade) / <alpha-value>)',
          soft: 'hsl(var(--jade-soft) / <alpha-value>)',
          wash: 'hsl(var(--jade-wash) / <alpha-value>)',
        },
      },
      fontFamily: {
        // The journal's voice: headings, names, anything emotional.
        display: ['Fraunces', 'Georgia', 'Times New Roman', 'serif'],
        // The journal's handwriting-adjacent UI type: labels, controls, data.
        sans: ['Karla', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Chinese characters deserve a serif that matches the display face.
        script: ['Noto Serif SC', 'Songti SC', 'SimSun', 'serif'],
      },
      fontSize: {
        // Nothing below 12px, per the accessibility floor.
        xs: ['0.75rem', { lineHeight: '1.1rem', letterSpacing: '0.01em' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.9375rem', { lineHeight: '1.5rem' }],
        lg: ['1.0625rem', { lineHeight: '1.6rem' }],
        xl: ['1.25rem', { lineHeight: '1.65rem' }],
        '2xl': ['1.5rem', { lineHeight: '1.8rem', letterSpacing: '-0.01em' }],
        '3xl': ['1.9375rem', { lineHeight: '2.2rem', letterSpacing: '-0.015em' }],
        '4xl': ['2.5rem', { lineHeight: '2.7rem', letterSpacing: '-0.02em' }],
        '5xl': ['3.25rem', { lineHeight: '3.4rem', letterSpacing: '-0.025em' }],
      },
      borderRadius: {
        // Letterpress, not startup. Corners stay tight.
        none: '0',
        sm: '2px',
        DEFAULT: '3px',
        md: '4px',
        lg: '6px',
        seal: '8px',
        full: '9999px',
      },
      boxShadow: {
        // Warm ink shadows — never neutral grey, never a blue glow.
        card: '0 1px 2px hsl(var(--shadow) / 0.06), 0 6px 16px -10px hsl(var(--shadow) / 0.18)',
        lift: '0 2px 4px hsl(var(--shadow) / 0.07), 0 14px 32px -16px hsl(var(--shadow) / 0.28)',
        seal: '0 1px 1px hsl(var(--shadow) / 0.22), 0 3px 8px -4px hsl(var(--shadow) / 0.3)',
        inset: 'inset 0 1px 2px hsl(var(--shadow) / 0.09)',
      },
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
        '22': '5.5rem',
      },
      maxWidth: {
        column: '38rem',
        page: '64rem',
      },
      keyframes: {
        press: {
          '0%': { transform: 'scale(1.28) rotate(-8deg)', opacity: '0' },
          '55%': { transform: 'scale(0.94) rotate(1deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        rise: {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        draw: {
          '0%': { strokeDashoffset: '1' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      animation: {
        press: 'press 420ms cubic-bezier(0.2, 0.8, 0.3, 1) both',
        rise: 'rise 320ms cubic-bezier(0.2, 0.7, 0.3, 1) both',
      },
      transitionTimingFunction: {
        page: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;

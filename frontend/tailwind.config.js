/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // All colors resolve to CSS variables defined in src/index.css (light + dark).
      colors: {
        white: v('surface'), // "white" = card / panel surface in both themes
        ink: v('ink'), // foreground text
        cream: v('bg'), // page background
        line: v('line'), // hairline borders
        onaccent: v('onaccent'), // text on lime / colored fills
        brand: { DEFAULT: v('brand'), dark: v('brand-dark'), soft: v('brand-soft') },
        sun: { DEFAULT: v('sun'), soft: v('sun-soft') }, // neutral highlight / selected
        mint: { DEFAULT: v('mint'), dark: v('mint-dark'), soft: v('mint-soft') }, // success
        berry: { DEFAULT: v('berry'), soft: v('berry-soft') }, // danger
      },
      fontFamily: {
        display: ['Oswald', 'Impact', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        hard: 'var(--shadow)',
        'hard-sm': 'var(--shadow-sm)',
      },
    },
  },
  plugins: [],
};

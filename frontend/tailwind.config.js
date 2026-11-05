/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1E2235',
        cream: '#FFF6E8',
        brand: { DEFAULT: '#FF6B35', dark: '#E8531C', soft: '#FFE4D6' },
        sun: { DEFAULT: '#FFC93C', soft: '#FFF0BF' },
        mint: { DEFAULT: '#12B5A6', dark: '#0B8F83', soft: '#D3F5F0' },
        berry: { DEFAULT: '#FF5C8A', soft: '#FFE0EA' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        hard: '3px 3px 0 0 #1E2235',
        'hard-sm': '2px 2px 0 0 #1E2235',
      },
    },
  },
  plugins: [],
};

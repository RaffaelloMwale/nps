/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy:  { DEFAULT: '#1E3A5F', light: '#2E6DA4', dark: '#122440' },
        gold:  { DEFAULT: '#C9A84C', light: '#E8C96A', dark: '#A07A2A' },
      },
      fontFamily: {
        sans:    ['"Source Sans 3"', 'sans-serif'],
        display: ['"Playfair Display"', 'serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};

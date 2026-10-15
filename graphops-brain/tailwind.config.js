/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: {
    colors: { ink: '#0d1117', panel: '#121821', line: '#252e3a', muted: '#8b98a8', lime: '#b9f56a', mint: '#57e0b0', violet: '#a78bfa' },
    boxShadow: { glow: '0 0 32px rgba(185,245,106,.09)', soft: '0 12px 40px rgba(0,0,0,.20)' },
    fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] }
  } },
  plugins: []
}

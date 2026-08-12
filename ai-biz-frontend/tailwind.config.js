/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      colors: {
        brand: { 50:'#eef2ff',100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',500:'#6366f1',600:'#4f46e5',700:'#4338ca',800:'#3730a3',900:'#312e81' },
        ink: { 900:'#0f172a',800:'#1e293b',700:'#334155',600:'#475569',500:'#64748b',400:'#94a3b8',300:'#cbd5e1',200:'#e2e8f0',100:'#f1f5f9',50:'#f8fafc' }
      }
    }
  },
  plugins: [],
}

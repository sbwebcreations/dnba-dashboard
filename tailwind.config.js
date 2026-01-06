/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#030712',
        'bg-secondary': '#0f1729',
        'bg-tertiary': '#1a2744',
        'bg-hover': '#243352',
        'border-primary': '#1e3a5f',
        'border-secondary': '#2d4a6f',
      }
    },
  },
  plugins: [],
}

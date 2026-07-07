/** @type {import('tailwindcss').Config} */
// Design tokens de Zenythic: corporativo blanco/gris + líneas doradas finas
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutros corporativos
        ink: {
          50: '#F6F6F8',
          100: '#EFEFF2',
          200: '#E2E2E8',
          300: '#C9C9D2',
          400: '#9A9AA6',
          500: '#5A5A66',
          600: '#3D3D47',
          700: '#2A2A32',
          800: '#1A1A1F',
          900: '#0F0F12',
        },
        // Dorado — acento en líneas, bordes, underlines, iconos
        gold: {
          50: '#FBF7EC',
          100: '#F5ECD0',
          200: '#E9D79E',
          300: '#DCC36E',
          400: '#C9A961', // dorado principal
          500: '#B89248',
          600: '#9A7A38',
          700: '#7A602C',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        widest2: '0.25em',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 15, 18, 0.04), 0 8px 24px rgba(15, 15, 18, 0.04)',
        gold: '0 0 0 1px rgba(201, 169, 97, 0.4)',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
};

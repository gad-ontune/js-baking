/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        canvas: '#FAF7F2',
        ink: '#241E1A',
        muted: '#7A6F66',
        line: '#E9E1D7',
        bakery: {
          50: '#FBF5EE',
          100: '#F5E7D6',
          200: '#EBCBAE',
          300: '#DDA981',
          400: '#CB8659',
          500: '#B66D3F',
          600: '#9D5630',
          700: '#7F4328',
          800: '#673926',
          900: '#553123',
        },
        leaf: {
          50: '#EFF8F3',
          100: '#D9EFE3',
          500: '#2E8B62',
          600: '#24704E',
          700: '#1C583E',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(36,30,26,0.04), 0 8px 24px rgba(36,30,26,0.04)',
        lift: '0 12px 32px rgba(36,30,26,0.10)',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out both',
        'slide-in': 'slide-in 0.25s ease-out both',
      },
    },
  },
  plugins: [],
}

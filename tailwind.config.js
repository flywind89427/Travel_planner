/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcdaff',
          300: '#8ec2ff',
          400: '#599fff',
          500: '#337bf6',
          600: '#1d5ee0',
          700: '#184bb5',
          800: '#1a418f',
          900: '#1a3a72',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

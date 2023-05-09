/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        'gray-950': '#0b0f18',
        'gray-1000': '#0a0a0a',
        'gray-1100': '#080808',
        'beige-150': '#F5F1EF',
        'primary-500': '#FF6109',
        'primary-600': '#E65A08',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('flowbite/plugin')

  ],
}

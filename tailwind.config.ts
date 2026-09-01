import type { Config } from "tailwindcss";

import flowbitePlugin from 'flowbite/plugin'

export default {
  content: ['./src/**/*.{html,js,svelte,ts}', './node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}'],

  theme: {
		extend: {
      colors: {
        primary: {
          50: '#FFF5F2',
          100: '#FFF1EE',
          200: '#FFE4DE',
          300: '#FFD5CC',
          400: '#FFBCAD',
          500: '#FE795D',
          600: '#EF562F',
          700: '#b71c1c',
          800: '#a41919',
          900: '#A5371B'
        },
        clipPath: {
          'triangle': 'polygon(50% 0%, 0% 100%, 100% 100%)',
        }
      }
    }
	},

  plugins: [
    flowbitePlugin
  ]
} as Config;
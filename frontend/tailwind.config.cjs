/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        atelier: {
          50: "#faf9f7",
          100: "#f5f3ef",
          200: "#ebe9e5", // Base color theme
          300: "#ddd9d2",
          400: "#c7c1b7",
          500: "#a8a195",
          600: "#867f73",
          700: "#655f55",
          800: "#444038",
          900: "#22201c",
          950: "#151514",
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        heading: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-ibm-plex-serif)", "Georgia", "serif"],
        display: ["var(--font-audiowide)", "sans-serif"],
      },
      colors: {
        cream:  { DEFAULT: "#FFF6DE", dark: "#f0e4c0" },
        teal:   { DEFAULT: "#8BDFDD", dark: "#5bbfbd" },
        coral:  { DEFAULT: "#F48F68", dark: "#d96a44" },
        yellow: { DEFAULT: "#FFE394" },
        ink:    { DEFAULT: "#2c2218", muted: "#6b5c48", faint: "#a89880" },
      },
    },
  },
  plugins: [],
};

export default config;

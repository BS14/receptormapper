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
    },
  },
  plugins: [],
};

export default config;

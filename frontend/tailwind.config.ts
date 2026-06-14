import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  safelist: [
    // Fetch buttons
    "bg-teal", "bg-teal-dark", "hover:bg-teal-dark",
    "bg-coral", "bg-coral-dark", "hover:bg-coral-dark",
    "text-white", "text-ink",
    // Opacity variants used in quick links & panels
    "bg-teal/20", "bg-teal/40", "hover:bg-teal/40",
    "bg-coral/10", "bg-coral/15", "bg-coral/30", "hover:bg-coral/30",
    "border-teal", "border-teal/40", "border-coral/30",
    "text-teal-dark", "text-coral-dark",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-ibm-plex-serif)", "Georgia", "serif"],
        display: ["var(--font-audiowide)", "sans-serif"],
      },
      colors: {
        cream:  {
          DEFAULT: "rgb(255 246 222 / <alpha-value>)",
          dark:    "rgb(240 228 192 / <alpha-value>)",
        },
        teal:   {
          DEFAULT: "rgb(139 223 221 / <alpha-value>)",
          dark:    "rgb(91 191 189 / <alpha-value>)",
        },
        coral:  {
          DEFAULT: "rgb(244 143 104 / <alpha-value>)",
          dark:    "rgb(217 106 68 / <alpha-value>)",
        },
        yellow: {
          DEFAULT: "rgb(255 227 148 / <alpha-value>)",
        },
        ink:    {
          DEFAULT: "rgb(44 34 24 / <alpha-value>)",
          muted:   "rgb(107 92 72 / <alpha-value>)",
          faint:   "rgb(168 152 128 / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

export default config;

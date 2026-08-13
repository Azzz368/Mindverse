import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./shared/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        epilogue: ["var(--font-epilogue)", "sans-serif"],
        baskervville: ["var(--font-baskervville)", "serif"],
        "baskervville-bold": ["var(--font-baskervville-bold)", "serif"],
        "baskervville-medium-italic": ["var(--font-baskervville-medium-italic)", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;

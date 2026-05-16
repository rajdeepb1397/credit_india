import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0a0b",
          subtle: "#111114",
          card: "#15151a",
          hover: "#1c1c22",
        },
        border: {
          DEFAULT: "#26262e",
          strong: "#36363f",
        },
        fg: {
          DEFAULT: "#f5f5f7",
          muted: "#9999a3",
          subtle: "#6b6b75",
        },
        accent: {
          DEFAULT: "#a78bfa",
          glow: "#7c3aed",
          gold: "#f5c451",
          mint: "#5eead4",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(167,139,250,0.25), 0 8px 40px -8px rgba(124,58,237,0.35)",
      },
      animation: {
        shimmer: "shimmer 3s linear infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
export default config;

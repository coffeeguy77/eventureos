import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        canvas: "#F7F7F9",
        ink: {
          DEFAULT: "#16151D",
          muted: "#5D5B6B",
          faint: "#8E8C9B",
        },
        line: {
          DEFAULT: "#E7E6EE",
          strong: "#D6D4E0",
        },
        brand: {
          50: "#F3EEFE",
          100: "#E6DCFD",
          200: "#CDB9FB",
          300: "#AB8BF7",
          400: "#8757F2",
          500: "#6028EC",
          600: "#4F17DB",
          700: "#420FBA",
          800: "#360E96",
          900: "#2A0D73",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(22, 21, 29, 0.04), 0 1px 1px rgba(22, 21, 29, 0.02)",
        pop: "0 12px 32px -8px rgba(22, 21, 29, 0.18), 0 2px 6px rgba(22, 21, 29, 0.06)",
      },
      borderRadius: {
        xl: "14px",
      },
    },
  },
  plugins: [],
};

export default config;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dragon: {
          primary: "#dc2626",
          dark: "#991b1b",
          light: "#fca5a5",
          gold: "#f59e0b",
        },
        surface: {
          bg: "#020617",       // slate-950 — deep navy
          card: "#0f172a",     // slate-900
          border: "#1e293b",   // slate-800
          hover: "#1e293b",    // slate-800
          raised: "#1e293b",   // slate-800
        },
        accent: {
          green: "#22c55e",
          cyan: "#06b6d4",
        },
      },
      fontFamily: {
        display: ['"Fira Sans"', "system-ui", "sans-serif"],
        mono: ['"Fira Code"', "monospace"],
      },
      maxWidth: {
        app: "28rem",
        tablet: "48rem",
      },
      boxShadow: {
        glow: "0 0 20px rgba(220,38,38,0.15)",
        "glow-sm": "0 0 10px rgba(220,38,38,0.1)",
        "glow-gold": "0 0 16px rgba(245,158,11,0.2)",
        "glow-green": "0 0 16px rgba(34,197,94,0.2)",
        card: "0 4px 24px rgba(0,0,0,0.3)",
        "card-hover": "0 8px 32px rgba(0,0,0,0.4)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "shimmer": "linear-gradient(110deg, transparent 33%, rgba(255,255,255,0.03) 50%, transparent 67%)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "shimmer": "shimmer 2s ease-in-out infinite",
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

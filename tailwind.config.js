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
          glow: "#ff3b3b",
        },
        surface: {
          bg: "#070a0f",
          raised: "#0d1117",
          card: "#111820",
          cardHover: "#161d27",
          border: "#1c2433",
          borderLight: "#263044",
          hover: "#151c26",
          muted: "#8892a4",
        },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', "sans-serif"],
        body: ['"Barlow"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      maxWidth: {
        app: "28rem",
        tablet: "48rem",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      boxShadow: {
        glow: "0 0 20px rgba(220, 38, 38, 0.15)",
        "glow-gold": "0 0 20px rgba(245, 158, 11, 0.12)",
        "card-hover": "0 8px 32px rgba(0, 0, 0, 0.4)",
        scoreboard: "0 2px 24px rgba(0, 0, 0, 0.5)",
      },
      animation: {
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.25s ease-out",
      },
      keyframes: {
        slideUp: {
          "0%": { transform: "translateY(16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

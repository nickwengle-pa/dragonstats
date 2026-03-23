/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dragon: {
          // Customize these to your school colors
          primary: "#dc2626",    // Red
          dark: "#991b1b",       // Dark red
          light: "#fca5a5",      // Light red
          gold: "#f59e0b",       // Gold accent
        },
        surface: {
          bg: "#0a0a0a",
          card: "#141414",
          border: "#262626",
          hover: "#1a1a1a",
        },
      },
      fontFamily: {
        display: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      maxWidth: {
        app: "28rem", // 448px — mobile constraint
      },
    },
  },
  plugins: [],
};

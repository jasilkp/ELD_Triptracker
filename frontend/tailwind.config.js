/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#050b17",
          900: "#0b1426",
          800: "#12223d",
          700: "#1a2f52",
          600: "#243a66",
        },
        steel: {
          100: "#e7eef7",
          200: "#c8d6e8",
          300: "#a9bfd8",
        },
        accent: {
          400: "#f7b955",
          500: "#f59e0b",
          600: "#d97706",
        },
        aqua: {
          400: "#3ccfe6",
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["IBM Plex Sans", "sans-serif"],
      },
      boxShadow: {
        glow: "0 30px 60px rgba(5, 10, 20, 0.55)",
      },
    },
  },
  plugins: [],
};

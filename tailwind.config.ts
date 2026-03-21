import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        breakfast: {
          bg: "hsl(45 30% 98%)",
          card: "hsl(50 40% 100%)",
          accent: "hsl(38 92% 50%)",
          muted: "hsl(40 20% 92%)",
        },
        lunch: {
          bg: "hsl(220 14% 96%)",
          card: "hsl(0 0% 100%)",
          accent: "hsl(220 70% 50%)",
          muted: "hsl(220 10% 92%)",
        },
        dinner: {
          bg: "hsl(240 20% 8%)",
          card: "hsla(240 15% 12% / 0.7)",
          accent: "hsl(45 90% 55%)",
          muted: "hsla(240 10% 18% / 0.6)",
        },
      },
      backdropBlur: {
        glass: "20px",
      },
      animation: {
        "theme-fade": "theme-fade 0.6s ease-out forwards",
      },
      keyframes: {
        "theme-fade": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

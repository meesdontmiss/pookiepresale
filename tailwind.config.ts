/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: [
          "Helvetica",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        float: {
          "0%": { transform: "translateY(0) translateX(0)" },
          "25%": { transform: "translateY(-20px) translateX(10px)" },
          "50%": { transform: "translateY(-10px) translateX(20px)" },
          "75%": { transform: "translateY(-30px) translateX(-10px)" },
          "100%": { transform: "translateY(0) translateX(0)" },
        },
        floatSlow: {
          "0%": { transform: "translateY(0) translateX(0) rotate(0deg)" },
          "50%": { transform: "translateY(-10px) translateX(5px) rotate(2deg)" },
          "100%": { transform: "translateY(0) translateX(0) rotate(0deg)" },
        },
        pulse: {
          "0%": { boxShadow: "0 0 0 0 rgba(0, 255, 136, 0.7)" },
          "70%": { boxShadow: "0 0 0 10px rgba(0, 255, 136, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(0, 255, 136, 0)" },
        },
        glowPulse: {
          "0%": { filter: "drop-shadow(0 0 2px rgba(0, 255, 136, 0.7))" },
          "50%": { filter: "drop-shadow(0 0 8px rgba(0, 255, 136, 0.9))" },
          "100%": { filter: "drop-shadow(0 0 2px rgba(0, 255, 136, 0.7))" },
        },
        shine: {
          "0%": { top: "-50%", left: "-50%" },
          "100%": { top: "150%", left: "150%" },
        },
        glow: {
          from: { boxShadow: "0 0 5px hsl(var(--primary))" },
          to: { boxShadow: "0 0 15px hsl(var(--primary)), 0 0 20px hsl(var(--primary))" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-subtle": {
          "0%": { opacity: "0.9" },
          "50%": { opacity: "1" },
          "100%": { opacity: "0.9" },
        },
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "float": "float 10s ease-in-out infinite",
        "float-slow": "floatSlow 8s ease-in-out infinite",
        "pulse": "pulse 2s infinite",
        "glow-pulse": "glowPulse 3s infinite",
        "shine": "shine 3s infinite",
        "glow": "glow 1.5s ease-in-out infinite alternate",
        "fade-in": "fade-in 0.5s ease forwards",
        "pulse-subtle": "pulse-subtle 2s ease-in-out infinite",
        "marquee": "marquee 25s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config


import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
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
      screens: {
        'xs': '420px',
      },
      fontFamily: {
        sans: ['Geist Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono Variable', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Ramp SC/* do Figma — [tamanho, { lineHeight, letterSpacing }]
        'display':    ['36px',   { lineHeight: '37.8px', letterSpacing: '-1.26px', fontWeight: '500' }],
        'metric-xl':  ['30px',   { lineHeight: '33px',   letterSpacing: '-0.9px',  fontWeight: '500' }],
        'h2-hero':    ['25px',   { lineHeight: '28.75px',letterSpacing: '-0.5px',  fontWeight: '700' }],
        'h3-section': ['20px',   { lineHeight: '30px',   letterSpacing: '-0.4px',  fontWeight: '500' }],
        'h4-card':    ['16px',   { lineHeight: '24px',   letterSpacing: '-0.24px', fontWeight: '600' }],
        'body':       ['14.5px', { lineHeight: '21.75px' }],
        'body-sm':    ['14px',   { lineHeight: '21px' }],
        'nav':        ['13.5px', { lineHeight: '20.25px',letterSpacing: '-0.07px' }],
        'ui':         ['13px',   { lineHeight: '19.5px' }],
        'ui-strong':  ['13px',   { lineHeight: '19.5px', letterSpacing: '-0.065px', fontWeight: '600' }],
        'link':       ['12.5px', { lineHeight: '18.75px',letterSpacing: '-0.06px', fontWeight: '600' }],
        'mono-sm':    ['12.5px', { lineHeight: '18.75px' }],
        'meta':       ['11.5px', { lineHeight: '17.25px' }],
        'kicker':     ['11px',   { lineHeight: '16.5px', letterSpacing: '0.66px',  fontWeight: '500' }],
        'badge':      ['10.5px', { lineHeight: '15.75px' }],
      },

      colors: {
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
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
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // ── Tokens do Design System (Figma SC/Color) ──
        paper: 'var(--paper)',
        bg: 'var(--bg)',
        'bg-2': 'var(--bg-2)',
        'bg-3': 'var(--bg-3)',

        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'muted-ink': 'var(--muted-ink)',
        'muted-ink-2': 'var(--muted-ink-2)',
        'on-brand': 'var(--on-brand)',

        line: 'var(--line)',
        'line-2': 'var(--line-2)',

        brand: 'var(--brand)',
        'brand-2': 'var(--brand-2)',
        'brand-deep': 'var(--brand-deep)',
        'brand-ink': 'var(--brand-ink)',
        'brand-tint': 'var(--brand-tint)',
        'brand-soft': 'var(--brand-soft)',

        'on-banner': 'var(--on-banner)',

        ok: 'var(--ok)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
        'ok-soft': 'var(--ok-soft)',
        'warn-soft': 'var(--warn-soft)',
        'danger-soft': 'var(--danger-soft)',
      },
      backgroundImage: {
        // Gradiente do banner de marca, medido no Figma (linear brand-2 -> brand)
        'brand-banner': 'linear-gradient(115deg, var(--banner-from) 0%, var(--banner-to) 100%)',
      },
      boxShadow: {
        'sc-sm': 'var(--shadow-sm)',
        'sc-md': 'var(--shadow-md)',
        'sc-lg': 'var(--shadow-lg)',
        'sc-brand': 'var(--shadow-brand)',
      },
      borderRadius: {
        // Escala por componente (decisão 02): botão 8 · nav 10 · card 14 · banner 18
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
        pill: "var(--r-pill)",
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
        'card-fade-in': {
          '0%': { opacity: '0.9' },
          '100%': { opacity: '1' },
        },
        'page-fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        'card-in': 'card-fade-in 0.3s ease',
        'page-in': 'page-fade-in 0.3s ease',
      },

    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

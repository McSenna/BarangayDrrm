/** @type {import('tailwindcss').Config} */
// Every colour, radius and shadow here points at a CSS variable from
// src/styles/tokens.css, the single source of design tokens. No hex values.
const v = (name) => `var(--${name})`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ---- Core palette (new code uses these names) ----
        navy: { DEFAULT: v("color-navy"), deep: v("color-navy-deep") },
        slate: { DEFAULT: v("color-slate") },
        red: { DEFAULT: v("color-red"), tint: v("color-red-tint"), border: v("color-red-border"), ink: v("color-red-ink") },
        orange: { DEFAULT: v("color-orange"), tint: v("color-orange-tint"), ink: v("color-orange-ink") },
        green: { DEFAULT: v("color-green"), tint: v("color-green-tint"), ink: v("color-green-ink") },
        sidebar: {
          text: v("color-sidebar-text"),
          label: v("color-sidebar-label"),
          divider: v("color-sidebar-divider"),
          hover: v("color-sidebar-hover"),
        },

        // ---- Surfaces and text ----
        bg: v("color-slate"),
        surface: v("color-white"),
        ink: {
          DEFAULT: v("color-text"),
          soft: v("color-text-muted"),     // safe on slate and white
          muted: v("color-text-muted"),
          subtle: v("color-text-subtle"),  // white surfaces only
        },
        border: v("color-border"),
        control: v("color-control"),

        // ---- Legacy names, re-pointed at the new palette so every existing
        //      page re-themes without edits. ----
        primary: { DEFAULT: v("color-navy"), dark: v("color-navy") },
        accent: { DEFAULT: v("color-navy"), soft: v("color-slate") },
        danger: { DEFAULT: v("color-red"), soft: v("color-red-tint"), ink: v("color-red-ink") },
        success: { DEFAULT: v("color-green"), soft: v("color-green-tint"), ink: v("color-green-ink") },
        warning: { DEFAULT: v("color-orange"), soft: v("color-orange-tint"), ink: v("color-orange-ink") },
        // Severity "High" sits on the red tint; "Critical" is the solid red fill.
        high: { DEFAULT: v("color-red"), soft: v("color-red-tint"), ink: v("color-red-ink") },
      },
      fontFamily: {
        sans: [v("font-sans")],
        display: [v("font-sans")],
      },
      boxShadow: {
        card: v("shadow-card"),
      },
      borderRadius: {
        DEFAULT: v("radius-control"),
        control: v("radius-control"),
        tile: v("radius-tile"),
        card: v("radius-card"),
        pill: v("radius-pill"),
      },
      spacing: {
        page: v("page-padding"),
        gap: v("grid-gap"),
        sidebar: v("sidebar-width"),
        header: v("header-height"),
      },
      maxWidth: {
        content: v("content-max"),
      },
    },
  },
  plugins: [],
};

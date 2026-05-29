/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,ts,jsx,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        // OKLCH tokens, drenched dark + halation accent
        surface: 'oklch(0.13 0.012 220)',          // page bg
        'surface-2': 'oklch(0.17 0.013 220)',      // raised bg (video frame inner)
        'surface-3': 'oklch(0.22 0.014 220)',      // dividers, hover bg
        ink: 'oklch(0.94 0.015 80)',               // primary type
        'ink-muted': 'oklch(0.72 0.012 80)',       // secondary type
        'ink-dim': 'oklch(0.52 0.010 80)',         // tertiary type, captions
        accent: 'oklch(0.74 0.18 55)',             // halation orange
        'accent-soft': 'oklch(0.74 0.18 55 / 0.18)',
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        'tightest-2': '-0.045em',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
      },
    },
  },
  plugins: [],
};

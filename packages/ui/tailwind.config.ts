import type { Config } from 'tailwindcss';

// Shared Tailwind preset for @erp/ui and @erp/web. RTL-first defaults; consumers
// extend `content` for their own file globs.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Arabic-first stack; app supplies the webfont.
        sans: ['var(--font-arabic)', 'Tajawal', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;

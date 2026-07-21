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
      colors: {
        // Semantic layer — "Nile teal" primary (Khartoum sits at the Blue/White
        // Nile confluence), warm sand-tinted neutrals instead of cold gray.
        // Keep raw Tailwind palette classes usable alongside these; this is an
        // additive layer, not a replacement of the whole default palette.
        primary: {
          DEFAULT: '#0E6E66',
          foreground: '#FFFFFF',
        },
        surface: '#FFFFFF',
        border: '#E5E1D8',
        muted: {
          DEFAULT: '#FAF9F6',
          foreground: '#6B6558',
        },
        success: '#1F9254',
        warning: '#B7791F',
        danger: '#C0392B',
        info: '#2B6CB0',
      },
      borderRadius: {
        DEFAULT: '0.375rem', // matches Tailwind's rounded-md; sets the app-wide default
      },
    },
  },
  plugins: [],
};

export default config;

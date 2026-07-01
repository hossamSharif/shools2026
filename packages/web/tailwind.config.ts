import type { Config } from 'tailwindcss';
import preset from '../ui/tailwind.config';

const config: Config = {
  presets: [preset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../ui/src/**/*.{ts,tsx}',
  ],
};

export default config;

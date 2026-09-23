import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://taco3064.github.io',
  base: '/shoal-app/',
  srcDir: './src/app',
  integrations: [react(), sitemap()],
});

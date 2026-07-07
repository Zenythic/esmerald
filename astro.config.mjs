import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Zenythic — configuración del sitio
// ES idioma por defecto (raíz /), EN en /en/
export default defineConfig({
  site: 'https://zenythic.com',
  integrations: [tailwind({ applyBaseStyles: false })],
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});

# Zenythic — Landing Page

Proveedor de juegos de casino. Landing corporativa B2B con identidad minimalista: blanco/gris + líneas doradas finas. Multilenguaje ES/EN.

## Stack
- **Astro** — framework principal (rendimiento óptimo, casi cero JS)
- **Tailwind CSS** — estilos utility-first con design tokens propios
- **i18n nativo de Astro** — ES por defecto (`/`), EN en (`/en/`)

## Estructura
```
src/
├── components/      # Navbar, Hero, Features, Solutions, Technology, CTA, Footer...
├── i18n/            # ui.ts + diccionarios es.json / en.json
├── layouts/         # Layout.astro (head, SEO, fonts)
├── pages/
│   ├── index.astro      # Español (default)
│   └── en/index.astro   # Inglés
└── styles/global.css
```

## Cómo ejecutar
```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # genera /dist
npm run preview   # previsualiza el build
```

## Identidad visual
| Token | Color | Uso |
|---|---|---|
| `ink-800/900` | `#1A1A1F` / `#0F0F12` | texto principal |
| `ink-50/100` | `#F6F6F8` / `#EFEFF2` | fondos suaves |
| `gold-400` | `#C9A961` | líneas, bordes, underlines, acentos |

## Próximos pasos
- [ ] Definir catálogo real de juegos (sustituir placeholders de `GamePreview`)
- [ ] Páginas individuales por juego
- [ ] Formulario de contacto funcional
- [ ] Integración backend / dashboard

---
Zenythic es un proveedor B2B para operadores con licencia. Juego responsable. +18.

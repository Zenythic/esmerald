# Zenythic — Arquitectura de Juegos

> **Este documento es el esquema rector.** Cada vez que se añada, modifique o rompa una convención de la arquitectura de juegos, se DEBE actualizar este archivo y anotar el cambio en el registro de abajo. Es la "ruta segura" para que todos los juegos sigan el mismo patrón.

---

## Registro de cambios (CHANGELOG del esquema)

| Fecha       | Cambio                                                                                  | Autor     |
|-------------|-----------------------------------------------------------------------------------------|-----------|
| 2026-07-06  | Creación del documento. Definición de layout estándar, motor RNG, splash y ciclo de vida | Zenythic  |
| 2026-07-06  | Estado de `callejero9` → **Demo funcional**. Banca fija = Zenythic (no rota). Integrado en la landing como ruta `/games/callejero9/`. | Zenythic  |
| 2026-07-06  | `callejero9` → **3 plazas jugables** sin bots (izq→der: P3·P1·P2). Placeholders de cartas antes de repartir. Fichas apiladas junto a los placeholders (ficha equipada + click en plaza). Acción por plaza con **foco dorado** sobre la plaza en turno (`.seat--spotlight`). Eliminada la apuesta de resultado 0–9. | Zenythic  |
| 2026-07-06  | Estado de `heist` → **Demo funcional**. Juego tipo mines/crash con gancho narrativo (ladrón de bancos). 10 cajas, multiplicador hasta 100x, trampa de tinta, retirada voluntaria. Integrado en la landing como ruta `/games/heist/`. | Zenythic  |
| 2026-07-06  | `heist` → **Multiplicador aleatorio por caja** (antes era fijo). Ahora cada caja oculta un valor dentro de un rango creciente (1.05–100x), sesgado a bajo con cola larga. El jugador solo ve el rango, no el valor. **Animación de dial**: el reloj de la caja se completa al abrirla; si va a fallar, explota en un punto aleatorio de la animación. | Zenythic  |

---

## 1. Filosofía

Cada juego de Zenythic es un **módulo aislado y autocontenido** que vive dentro del proyecto Astro pero **no depende de Astro**. Esto permite:

- Desplegarlos como **iframe firmado** dentro de plataformas de operadores.
- Cargarlos en el sitio propio como una ruta más.
- Testear la lógica de juego de forma unitaria sin navegador.

Tres capas, **siempre separadas**:

```
┌─────────────────────────────────────────────┐
│  UI (index.html + styles.css)               │  Solo presenta el estado. Sin lógica.
├─────────────────────────────────────────────┤
│  Controller (game.mjs)                      │  Máquina de estados. Conecta lógica y UI.
├─────────────────────────────────────────────┤
│  Rules (rules.mjs)                          │  Lógica PURA. Sin DOM, sin estado global.
└─────────────────────────────────────────────┘
```

**Regla de oro:** `rules.mjs` nunca importa nada del DOM. Es 100% testeable en Node.

---

## 2. Layout estándar de un juego

```
src/games/<game-slug>/
├── index.html        # Vista. Estructura semántica + <script type="module" src="./game.mjs">
├── styles.css        # Estilos del juego (importa _shared/base.css)
├── game.mjs          # Controller: state machine + orquestación UI ↔ rules
├── rules.mjs         # Lógica pura y exportable (decks, scoring, resolución)
└── README.md         # Cómo se juega + parámetros + notas de diseño
```

Recursos compartidos por todos los juegos:

```
src/games/_shared/
├── base.css          # Reset + tokens + utilidades (importa el dorado de Zenythic)
├── rng.mjs           # Generador provably-fair (seed del servidor + nonce del cliente)
├── deck.mjs          # Baraja estándar, barajado y robo
├── wallet.mjs        # Billetera del jugador (saldo, apuestas, pagos)
├── splash.mjs        # Splash de carga con logo Zenythic (exporta showSplash())
└── audio.mjs         # (futuro) sonido / música
```

---

## 3. Ciclo de vida de una ronda (genérico)

Todo juego sigue este flujo. Los estados están en `game.mjs` como strings:

```
SPLASH → BETTING → DEALING → PLAYER_ACTION → DEALER_ACTION → RESOLVE → (loop a BETTING)
```

| Estado          | Qué pasa                                                            |
|-----------------|---------------------------------------------------------------------|
| `SPLASH`        | Logo Zenythic + carga. Auto-transición a `BETTING`.                 |
| `BETTING`       | El jugador fija su apuesta. UI habilita "Repartir".                 |
| `DEALING`       | Se reparten cartas (animación). Avanza solo.                        |
| `PLAYER_ACTION` | El jugador decide (pedir/plantar/etc.). En juegos automáticos, no-op.|
| `DEALER_ACTION` | La casa actúa según sus reglas fijas.                               |
| `RESOLVE`       | Comparación, pago, mostrar resultado. Botón "Otra ronda".           |

Cada juego documenta en su `README.md` qué estados usa y qué transiciones tiene.

---

## 4. RNG Provably-Fair

`_shared/rng.mjs` expone:

```js
createRng({ serverSeed, clientSeed, nonce })
rng.next()      // float [0,1)
rng.int(max)    // entero [0, max)
```

- **serverSeed:** hash proveído por el backend (en el demo, un hash fijo).
- **clientSeed:** elegido por el jugador.
- **nonce:** incrementa en cada ronda.

El jugador puede, en cualquier momento, **verificar** que el resultado no fue manipulado: el servidor revela el `serverSeed` tras la ronda y el cliente recomputa. **Todos** los juegos consumen este RNG. Ningún juego usa `Math.random()` para el resultado.

---

## 5. Splash de carga Zenythic

`_shared/splash.mjs` expone `showSplash({ durationMs })`. Inserta un overlay full-screen con:

1. Fondo `--ink-900` (#0F0F12).
2. Monograma "Z" con trazo dorado, animación de dibujo.
3. Wordmark "ZENYTHIC" con fade-in.
4. Barra de progreso dorada de 0→100%.
5. Auto-eliminación al terminar.

**Obligatorio** al iniciar cualquier juego. Da identidad de marca y tiempo para preparar assets.

---

## 6. Convenciones de marca

- Dorado `#C9A961` solo en acentos: bordes, underlines, CTA primario, líneas separadoras.
- Fondos: blanco `#FFFFFF` o `#F6F6F8` para mesas claras; `#0F0F12` para mesas oscuras.
- Tipografía: **Manrope**.
- Esquinas **rectas** (border-radius: 0). Zenythic es sobrio, no redondeado.
- Cartas: factor común en la mayoría de juegos — usar el componente de carta de `base.css`.

---

## 7. Juegos en catálogo

| Slug          | Estado          | Tipo               | Notas                                          |
|---------------|-----------------|--------------------|------------------------------------------------|
| `callejero9`  | Demo funcional  | Baccarat callejero | Banca fija = Zenythic. 3 plazas jugables (sin bots), placeholders de cartas, fichas apiladas, foco dorado sobre la plaza en turno de acción. Ruta `/games/callejero9/`. |
| `heist`       | Demo funcional  | Mines / Crash      | 10 cajas fuertes, multiplicador hasta 100x, trampa de tinta (bust total), retirada voluntaria. RNG provably-fair. Ruta `/games/heist/`. |
| _(próximos)_  | Planificado     | —                  |                                                |

Cada juego tiene su propia fila cuando se empieza.

---

## 8. Cómo integrar un juego en el sitio

1. El juego se sirve como página estática bajo `public/games/<slug>/` o como ruta Astro. Para el demo usamos `public/games/` para máxima portabilidad (un `index.html` puro = fácil de embeber como iframe).
2. Desde la landing se enlaza con `/games/<slug>/` y se abre en su propia vista.
3. Para producción: el mismo `index.html` se sirve bajo dominio del operador con un token firmado.

---

## 9. Pendientes / Roadmap de la arquitectura

- [ ] Backend real que sirva `serverSeed` y verificación post-ronda.
- [ ] Webhooks de eventos de ronda (`ROUND_START`, `BET_PLACED`, `ROUND_RESOLVE`).
- [ ] Sistema de sonido (`audio.mjs`).
- [ ] Modo demo / modo real (toggle de wallet real vs fichas virtuales).
- [ ] Tests unitarios de `rules.mjs` de cada juego.

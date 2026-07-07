# Heist · Zenythic

Juego de tensión tipo "mines/crash" con gancho narrativo de ladrón de bancos.

## Premisa
Eres un ladrón entrando a la bóveda de un banco. Tienes 10 cajas fuertes por abrir. Cada caja oculta un **multiplicador aleatorio** dentro de un rango que crece con la profundidad. No sabes cuánto vas a sacar hasta abrirla — la esperanza del "quizás esta me da x100" es el motor del juego. En cualquier momento puedes retirarte con el botín acumulado. Pero si una caja contiene una **trampa de tinta**, pierdes TODO.

## Mecánica
1. Apuestas y empiezas el golpe.
2. Abres cajas una a una. El multiplicador es **aleatorio** dentro del rango de cada caja (sesgado a valores bajos, con cola larga).
3. Los multiplicadores se **acumulan** (producto). Ej: `1.2 × 1.5 × 2 = 3.6x`.
4. Cada caja tiene probabilidad creciente de tinta (4% → 33%).
5. Puedes **retirarte** cuando quieras y cobrar `apuesta × multiplicador acumulado`.
6. Si abres las 10 sin tinta → **Gran Golpe**.

## Rangos por caja
| Caja | Rango mult | Riesgo tinta |
|------|------------|--------------|
| 1    | 1.05x – 1.40x  | 4%  |
| 2    | 1.10x – 1.80x  | 6%  |
| 3    | 1.20x – 2.50x  | 8%  |
| 4    | 1.35x – 3.50x  | 10% |
| 5    | 1.50x – 5.00x  | 12% |
| 6    | 1.70x – 8.00x  | 15% |
| 7    | 1.90x – 15.00x | 18% |
| 8    | 2.20x – 30.00x | 22% |
| 9    | 2.50x – 60.00x | 27% |
| 10   | 3.00x – 100.00x| 33% |

## Animación del dial
Al abrir una caja, su dial se completa (reloj). Si la caja va a fallar, **explota en un punto aleatorio** de la animación — puede ser al inicio o casi al final. Esto genera tensión: el jugador ve el progreso y no sabe si llegará a completarse.

## Estados (state machine)
```
SPLASH → BETTING → PLAYING → (OPENING→SUCCESS|BUST | CASHOUT | MAXED) → RESOLVE → BETTING…
```

## Archivos
| Archivo     | Rol                                                        |
|-------------|------------------------------------------------------------|
| `rules.mjs` | Lógica pura (rangos, multiplicador aleatorio sesgado, tinta, pago). Testeable en Node. |
| `game.mjs`  | Controller: state machine + animación del dial + splash de tinta. |
| `index.html`| Vista: bóveda con 10 cajas, paneles, modal de reglas.     |
| `styles.css`| Estética "banco": acero oscuro + dorado, dials SVG, splash de tinta. |

## Parámetros
- `startingBalance`: $1000 (demo)
- `MAX_VAULTS`: 10
- Distribución del multiplicador: `x = rng^(1/alpha)` con alpha decreciente por caja (sesgo a bajo, cola larga)
- RNG: provably-fair (`serverSeed` demo + `clientSeed` + `nonce`), 2 consumos por caja.

## Notas de diseño
- El **rango** (no el valor exacto) es lo que se muestra en cada caja y panel — incertidumbre controlada.
- El multiplicador solo se revela al abrir con éxito.
- El % de riesgo de tinta es visible: decisión informada.
- El splash de tinta cubre la pantalla desde la caja que la activó.


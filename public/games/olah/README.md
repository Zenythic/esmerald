# Olah · Zenythic

Juego de tensión tipo **crash** con temática marina: el barco *FORTUNA* remonta olas
al atardecer mientras el multiplicador sube de forma continua. Detente a tiempo y
cobra… antes de que una ola hunda el barco.

## Premisa
El barco *FORTUNA* surca un mar tropical al atardecer **avanzando de izquierda a
derecha** (side-scroller). La cámara lo sigue: el fondo y las olas se desplazan con
parallax. Las olas se alzan una tras otra como **obstáculos que el barco trepa en
automático**; cada ola coronada eleva el multiplicador. El jugador no controla el
avance —solo decide **cuándo detenerse**. Si el multiplicador en vivo alcanza el
**umbral de hundimiento** de la ronda, la ola rompe y el barco se va a pique (bust,
pierde todo).

## Assets (sprites)
| Archivo     | Rol                                              |
|-------------|--------------------------------------------------|
| `fondo.png` | Capa de fondo (cielo/sol/islas/mar). Parallax lento, `repeat-x`. |
| `olas.png`  | Capa de olas (línea del horizonte + frente). Parallax medio/rápido, `repeat-x`. |
| `barco.png` | Sprite del barco *FORTUNA* (transparente). Se escala a ~150px de alto. |

## Mecánica
1. Apuestas y zarpa.
2. El barco avanza hacia la derecha; el fondo y las olas se desplazan con parallax.
3. Las olas son **obstáculos a trepar** con **tamaño aleatorio** (pequeña / mediana /
   grande / enorme). El barco las escala en automático:
   - más grande → **mayor salto** de multiplicador al coronarla;
   - más grande → llega antes al umbral de hundimiento → **más peligro**.
4. El multiplicador sube **de forma continua** (estilo crash) mientras el barco escala cada ola.
5. En cualquier instante puedes pulsar **Detener** y cobrar `apuesta × multiplicador en vivo`.
6. Si el multiplicador alcanza el umbral de hundimiento → **hundimiento**, pierdes todo.
7. Si llegas a **50x** sin hundirte → **Gran Ola**, cobras el máximo.

## Modelo provably-fair (crash)
Al iniciar la ronda se consume un valor `u` del RNG y se calcula el **umbral de
hundimiento**:

```
C = clamp( RTP / u , 1.0 , MAX_MULT )     con RTP = 0.95, MAX_MULT = 50
```

El barco se hunde en el instante en que el multiplicador en vivo `m(t) ≥ C`. La
probabilidad de sobrevivir hasta el multiplicador `m` es `P(m < C) = RTP / m`
(para `m ≥ 1`), lo que fija el edge de la casa en `(1 − RTP) = 5%`. ≈1.9% de las
rondas llegan a 50x (Gran Ola); ≈5% se hunden en la primera ola.

Los **tamaños de ola** se samplean con consumos adicionales del mismo RNG (uno por
ola), así que toda la ronda es determinista y verificable a partir de
`(serverSeed, clientSeed, nonce)`.

## Tamaños de ola
| Ola       | Salto de mult. | Probabilidad |
|-----------|----------------|--------------|
| Pequeña   | +0.10x         | 50%          |
| Mediana   | +0.22x         | 28%          |
| Grande    | +0.45x         | 15%          |
| Enorme    | +0.90x         | 7%           |

## Estados (state machine)
```
SPLASH → BETTING → CLIMBING → (STOP | SINK | MAXED) → RESOLVE → BETTING…
```
| Estado     | Qué pasa                                                              |
|------------|-----------------------------------------------------------------------|
| `SPLASH`   | Logo Zenythic + carga. Auto-transición a `BETTING`.                   |
| `BETTING`  | El jugador fija su apuesta. UI habilita "Zarpar".                     |
| `CLIMBING` | El barco remonta olas en automático (rAF). El multiplicador sube en vivo. El jugador puede "Detener". |
| `RESOLVE`  | Pago, mensaje de resultado y botón "Nueva travesía".                  |

## Animación del remonte (side-scroller)
El bucle `requestAnimationFrame` avanza una `distance` (px/s) que mueve el parallax
de las capas (`fondo.png` lento, `olas.png` medio/rápido) dando la sensación de que
el barco navega hacia la derecha. Cada ola tiene una duración (`climbMs`) proporcional
a su tamaño; mientras el barco la trepa, el multiplicador en vivo se interpola con un
`easeOutQuad` (arranca con ímpetu y frena en la cresta — tensión: ¿la coronará?). El
sprite del barco se inclina y se levanta según el progreso. Al coronar, un pequeño
*bob* y entra la siguiente ola. Al hundirse, la ola-obstáculo rompe y el barco se
inclina y se sumerge.

## Archivos
| Archivo      | Rol                                                                        |
|--------------|----------------------------------------------------------------------------|
| `rules.mjs`  | Lógica pura (umbral de hundimiento, tamaños de ola, multiplicador en vivo, resolución de pago). Testeable en Node. |
| `game.mjs`   | Controller: state machine + bucle rAF (parallax + remonte) + hundimiento + ticker. |
| `index.html` | Vista: capas fondo/olas (parallax), sprite barco, ola-obstáculo, barra de multiplicador, paneles, modal de reglas. |
| `styles.css` | Side-scroller tropical al atardecer; parallax, sprite del barco, ola-obstáculo. |
| `fondo.png`  | Sprite de fondo (cielo/sol/islas/mar). |
| `olas.png`   | Sprite de olas (capas de parallax). |
| `barco.png`   | Sprite del barco *FORTUNA*. |

## Parámetros
- `startingBalance`: $1000 (demo)
- `MAX_MULT`: 50
- `RTP_TARGET`: 0.95
- `BOAT_SPEED`: 230 px/s (velocidad de avance del mundo / parallax)
- `PARALLAX`: fondo 0.25, olas lejanas 0.6, olas cercanas 1.0
- Tamaños de ola: 4 categorías con peso, `step` y `climbMs`.
- RNG: provably-fair (`serverSeed` demo + `clientSeed` + `nonce`), 1 consumo para el
  umbral de hundimiento + 1 consumo por ola.

## Notas de diseño
- El multiplicador es **en vivo y continuo** (no por paso discreto): el jugador ve
  el número crecer segundo a segundo y decide el instante exacto de cobrar.
- El **tamaño de la ola** se revela al acercarse (indicador superior): informa la
  tensión sin quitar la decisión.
- La **barra vertical** de la izquierda (1x→50x) y la **placa hexagonal** dorada
  que se desplaza al nivel del multiplicador son los anclajes visuales del premio.
- ` Detener` cambia de urgencia (verde → rojo) según crece el multiplicador.
- **Side-scroller**: el barco avanza y la cámara lo sigue; las olas son obstáculos
  físicos que trepa, no un mero número que sube.

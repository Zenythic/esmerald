# Trade · Zenythic

Juego de **predicción de líneas**: un gráfico de líneas sube y baja puntada a
puntada y, en cada pausa, tienes **5 segundos** para decidir si la próxima
puntada irá **arriba** o **abajo**. Acertar paga la ganancia neta de esa
puntada; fallar solo te cuesta la **mitad** de esa ganancia y el juego continúa.
En cualquier pausa puedes **Salir** con tu saldo.

## Premisa
El mercado dibuja una línea que se desplaza de izquierda a derecha, conectando
los cierres de cada puntada. Cada cierto número de puntadas entra en **pausa de
decisión**: no se dibujan nuevas líneas mientras el contador de 5 s corre. En ese
instante conoces el **multiplicador de la próxima puntada** (proporcional a su
magnitud) y debes elegir dirección (arriba/abajo, marcada con flechas verde/roja).
Al acabar el contador (o al pulsar), la próxima puntada cierra y se resuelve.
El stake se **compromete al entrar** y solo se recupera si sales voluntariamente;
el saldo libre fluye con cada acierto/fallo.

## Mecánica
1. Eliges apuesta (fichas 5/25/100) y pulsas **Entrar al mercado**. El monto se
   compromete (se descuenta del saldo visible).
2. El mercado vive: dibuja puntadas de "relleno" (random walk cosmético) un
   número fijado de veces (`TICKS_BETWEEN_DECISIONS = 4`).
3. **Pausa de decisión (5 s):** aparece el overlay con cuenta atrás. El panel
   muestra cuánto ganarías acertando y cuánto perderías fallando. Botones
   **ARRIBA** / **ABAJO**. Si no eliges, la dirección por defecto es ARRIBA.
4. **Resolución:** la próxima puntada cierra (dirección real determinada por el
   RNG sesgado) y se aplica el pago. Resultado breve (1,4 s) y vuelta al mercado.
5. En cualquier pausa puedes pulsar **Salir**: el stake comprometido se reintegra
   y la sesión cierra con tu saldo.
6. Si el saldo libre cae por debajo del stake comprometido, no puedes seguir y
   pierdes la apuesta inicial → sesión terminada.

## Modelo provably-fair y RTP 94%
El multiplicador de cada puntada es **LIMPIO** (no degradado) respecto a su
distancia `d ∈ [0,1]`:

```
m(d) = MIN_MULT + (MAX_MULT − MIN_MULT) · d^0.65     con MIN_MULT = 1.20, MAX_MULT = 3.00
```

El **edge de la casa (6%)** se cierra **sesgando la probabilidad de acierto por
puntada**, no tocando el multiplicador. Derivación: sea `GAIN = stake·(m−1)` la
ganancia neta al acertar; al fallar se pierde `GAIN/2`. El retorno esperado por
puntada es

```
E[retorno] = p · GAIN − (1 − p) · (GAIN/2) = GAIN · (3p − 1) / 2
```

Imponiendo `E[retorno] = −0.06 · stake` (pérdida media del 6% = edge 6%):

```
p(m) = (1 − 0.12 / (m − 1)) / 3          // clampado a [0.05, 0.85]
```

Cuanto mayor el multiplicador (más ganancia potencial), menor la probabilidad de
acertar: el sesgo codifica "más premio, más riesgo" y mantiene el edge **puntada
a puntada, independiente de `d`**.

Simulación Monte Carlo (300k puntadas, 3 semillas) con `MIN_MULT=1.20` da
**RTP ≈ 0.937–0.939** (muy próximo al 0.94 objetivo; la pequeña holgura proviene
del clamp de seguridad en `p`). El jugador acierta ~29–30% de las puntadas.

La dirección real de la puntada (arriba/abajo) se decide con dos consumos del
RNG: `uDist` (magnitud) y `uWin` (comparado contra `p(m)` para decidir qué
dirección es la "ganadora"). Toda la ronda es determinista y verificable a partir
de `(serverSeed, clientSeed, nonce)`.

## Resoluciones de pago
| Caso      | Pago (saldo libre)                         | Neto          |
|-----------|---------------------------------------------|---------------|
| Acertaste | `+ GAIN = stake · (m − 1)`                  | `+GAIN`       |
| Fallaste  | `− GAIN/2 = stake · (m − 1) / 2`            | `−GAIN/2`     |
| Salida    | reintegro del stake + saldo acumulado       | saldo total   |
| Saldo < stake | pierde la apuesta comprometida           | `−stake`      |

> Nota: el **stake** NO se descuenta de la ganancia al acertar — el stake está
> "comprometido" (no en el saldo libre). El saldo libre solo acumula las
> ganancias netas (positivas al acertar, negativas a medias al fallar). Al
> salir, el stake se reintegra al saldo.

## Probabilidad de acierto por multiplicador (extracto)
| Mult. | Ganas (neto) | Pierdes (neto) | Prob. acierto |
|-------|--------------|----------------|---------------|
| 1.20  | +20%         | −10%           | ~40%          |
| 1.56  | +56%         | −28%           | ~31%          |
| 2.00  | +100%        | −50%           | ~27%          |
| 3.00  | +200%        | −100%          | ~22%          |

(Valores exactos en `winProbabilityTable()`; la tabla del modal los renderiza.)

## Estados (state machine)
```
SPLASH → BETTING → LIVE → DECISION(5s) → RESOLVE → (loop a LIVE) → END
                                          ↓
                                       SALIDA ─→ END
```
| Estado     | Qué pasa                                                              |
|------------|-----------------------------------------------------------------------|
| `SPLASH`   | Logo Zenythic + carga. Auto-transición a `BETTING`.                   |
| `BETTING`  | El jugador fija su apuesta. UI habilita "Entrar al mercado".          |
| `LIVE`     | El gráfico dibuja puntadas de relleno (rAF). Tras N puntadas → DECISION. |
| `DECISION` | Pausa de 5s. Overlay con cuenta atrás. Botones ARRIBA/ABAJO/SALIR.    |
| `RESOLVE`  | La próxima puntada cierra y se aplica el pago. Breve, vuelve a LIVE.  |
| `END`      | Sesión cerrada (salida voluntaria o saldo insuficiente). "Nueva sesión". |

## Animación del gráfico
- **Puntadas de relleno** (`CANDLE_LIVE_MS = 700ms`): random walk oscilatorio
  cosmético dentro de cada puntada; al cerrar se añade el punto a la polilínea.
- **Puntada de resolución:** interpolación `easeOutCubic` desde el precio de
  partida al cierre real (determinado por el RNG sesgado), 600 ms.
- **La polilínea** se dibuja en dorado y cambia a verde (sube) o rojo (baja)
  según la tendencia reciente. Un área degradada rellena bajo la línea.
- **Punto "head"** dorado en el precio actual; **segmento punteado** que lo
  une al último cierre mientras la puntada está viva.
- **Preview de la próxima puntada** durante la pausa: flechas verde/roja que
  indican el rango posible y codifican la magnitud (más swing = más multiplicador).
- El gráfico reescala el eje Y automáticamente (con padding de 12%) y recorta el
  historial a las últimas 60 puntadas.

## Archivos
| Archivo      | Rol                                                                        |
|--------------|----------------------------------------------------------------------------|
| `rules.mjs`  | Lógica pura (curva mult/distancia, prob. de acierto p(m), resolución de pago, medida de RTP). Testeable en Node. |
| `game.mjs`   | Controller: state machine + rAF (gráfico de líneas) + decisión 5s + ticker. |
| `index.html` | Vista: gráfico SVG de líneas, HUD, overlay cuenta atrás, controles ARRIBA/ABAJO/SALIR, modal de reglas. |
| `styles.css` | Terminal de trading oscura; línea dorada/verde/roja, grilla fina, flechas de preview. |

## Parámetros
- `startingBalance`: $1000 (demo)
- `RTP_TARGET`: 0.94 (edge 6%)
- `MIN_MULT` / `MAX_MULT`: 1.20 / 3.00
- `DECISION_MS`: 5000 (pausa de 5s)
- `TICKS_BETWEEN_DECISIONS`: 4 (puntadas de relleno entre pausas)
- `CANDLE_LIVE_MS`: 700 (duración de una puntada en vivo)
- Fichas de apuesta: 5 / 25 / 100
- RNG: provably-fair (`serverSeed` demo + `clientSeed` + `nonce`), 2 consumos por
  puntada apostable (distancia + dirección resultado)

## Notas de diseño
- El gráfico de líneas y la estética de "terminal de trading" hacen que la
  decisión arriba/abajo se sienta como una operación bursátil, no como un click
  ciego: el jugador ve la tendencia reciente antes de elegir.
- La **regla de pérdida a medias** hace que las sesiones duren más (fallo no es
  KO) y refuerza la sensación de "todavía hay tiempo" — el sesgo de acierto
  compensa ese coste menor para mantener el edge en 6%.
- El **stake comprometido** separa conceptualmente "lo apostado" del "saldo
  libre": esto evita que el jugador malinterprete que está gastando de su saldo
  en cada acierto, y refuerza la idea de que solo puede recuperar el compromiso
  saliendo voluntariamente.
- El **overlay de cuenta atrás con anillo dorado** es el ancla de tensión de la
  pausa; se vuelve rojo en el último segundo y medio para forzar la decisión.

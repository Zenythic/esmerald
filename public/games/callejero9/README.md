# Callejero 9 · Zenythic

Variante de baccarat de mesa. La casa (Zenythic) actúa como **banca fija** y no rota. Sobre la mesa hay **3 plazas jugables por el jugador** ordenadas de izquierda a derecha:

- **Plaza 1** (izquierda) · `data-seat="player3"`
- **Plaza 2** (centro) · `data-seat="player1"`
- **Plaza 3** (derecha) · `data-seat="player2"`

> Nota: los identificadores internos (`player3`/`player1`/`player2`) se conservan por compatibilidad con el código; el orden visual izquierda→derecha es el que manda.

## Cómo se juega

1. **Apuestas:** selecciona una ficha (5/25/100) y pulsa una plaza para colocar tu apuesta. Puedes apostar en una, dos o las tres plazas, en cualquier orden. Las plazas sin apuesta permanecen inactivas. Antes del reparto se muestran marcadores de posición que indican dónde irán las cartas, junto a tus fichas apiladas.
2. **Reparto:** la casa reparte 2 cartas a cada plaza apostada y 2 para sí misma (una descubierta y una cubierta).
3. **Naturales:** sumar 8 o 9 con las dos primeras cartas es un *natural*. Si la casa tiene natural, la ronda se resuelve al instante.
   - **Natural de 9 de la casa:** la casa gana a todas las plazas, incluso a las que también sumen 9 (natural o no).
   - **Natural de 8 de la casa:** gana a menos que la plaza tenga 9 natural.
   - **Plaza con natural de 9 y la casa llega a 9 tras pedir** (sin natural): la mano se resuelve como empate.
4. **Pedir/plantar (por plaza):** sin natural, cada plaza apostada elige su jugada, recorrida de izquierda a derecha:
   - 0–5 puntos → conviene **pedir** una tercera carta.
   - 6–7 puntos → conviene **plantarse**.
   - La plaza en turno se resalta con un **foco dorado** (`.seat--spotlight`).
5. **Turno de la casa:** la casa destapa su carta cubierta; con 5 o menos pide tercera carta; con 6 o 7 se planta.
6. **Resolución:** la casa compara su puntaje contra **cada plaza apostada** de forma individual.
   - Plaza gana → cobra el equivalente a su apuesta.
   - Casa gana → retiene la apuesta.
   - Empate → se devuelve la apuesta íntegra.

## Estados (state machine)

```
SPLASH → BETTING → DEALING → PLAYER_ACTION → DEALER_ACTION → RESOLVE → BETTING…
```

## Archivos

| Archivo     | Rol                                                        |
|-------------|------------------------------------------------------------|
| `rules.mjs` | Lógica pura (reparto, scoring, resolución). Testeable en Node. |
| `game.mjs`  | Controller: orquesta UI ↔ rules con animaciones, fichas apiladas, placeholders y foco de plaza activa. |
| `index.html`| Vista semántica.                                           |
| `styles.css`| Estilos del juego (importa `_shared/base.css`).            |

## Parámetros

- `startingBalance`: $1000 (demo)
- `decks`: 1
- RNG: provably-fair con `serverSeed` demo fijo + `clientSeed` + `nonce`.

## Reglas API puras (rules.mjs)

```js
handScore(hand)                          // 0..9
isNatural(hand)                          // 8 o 9 con 2 cartas
mustDrawThird(hand)                      // true si 0..5
bankMustDrawThird(bankHand)              // true si ≤5
resolveHand(playerHand, bankHand, stake) // { outcome, playerScore, bankScore, payout }
playRound(deck, seats)                   // ronda completa
```

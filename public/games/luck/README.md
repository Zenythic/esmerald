# Luck - Zenythic

Juego de tragaperras en construccion. Esta primera etapa deja integrado el demo
en la web principal y ensambla la escena base con assets por capas.

## Estado actual

- Ruta publica: `/games/luck/index.html`
- Escena fija: `1246x701`
- Splash de carga Zenythic activo
- Topbar Zenythic con saldo compartido y ticker de apuestas globales
- Banner de catalogo: `banner.png`
- Capas numeradas montadas en orden visual
- Capa 4 con `laia_idle.webp` en su tamano y posicion inicial
- Grilla de prueba 5x3 con 5 reels verticales enmascarados dentro de la maquina
- Overlays funcionales para premios, apuesta, ganancia, autospin, ayuda, musica y `SPIN`
- Bloqueo temporal para telefono: esta version queda disponible solo en PC

## Assets de escena

| Archivo | Capa | Rol |
|---|---:|---|
| `assets/scenes/capa1_fondo.webp` | 1 | Fondo del casino |
| `assets/scenes/capa2_multiplicadores.webp` | 2 | Marcos de jackpots |
| `assets/scenes/capa3_fondo.webp` | 3 | Fondo interno de la maquina, detras de items y marco |
| `assets/scenes/capa3_maquina.webp` | 3 | Maquina y grilla de carretes |
| `assets/scenes/laia_idle.webp` / `laia_molesta.webp` | 4 | Personaje. `laia_idle.webp` integrada abajo a la izquierda |
| `assets/scenes/capa5_botonesInferiores.webp` | 5 | Botones inferiores |
| `assets/scenes/capa6_iconoPJ.webp` | 6 | Icono de personaje |
| `assets/scenes/capa7_BotonesARRIBADERECHA.webp` | 7 | Botones superiores derechos |

## Archivos

| Archivo | Rol |
|---|---|
| `index.html` | Vista de topbar, ticker, escena, modales y bloqueo PC |
| `styles.css` | Escalado de la escena 1246x701, modales, topbar y animaciones |
| `game.mjs` | Controller: wallet, preload, splash, reels, autospin, audio y pagos |
| `rules.mjs` | Configuracion pura: dimensiones, paylines, paytable y jackpots |

## Grilla de carretes

- Columnas: 5
- Filas: 3
- Primer centro: `(356, 254)`
- Ultimo centro: `(1000, 542)`
- Separacion calculada: `161px` horizontal, `144px` vertical
- Simbolo: `135x121.5` centrado sobre su propio eje
- Juego base: `bar`, `bell`, `cherry`, `coin`, `crown`, `diamond`, `star`, `wild`, `z`
- Bonus: los `item_bonus_x*` quedan reservados para la ronda bonus

## Reglas base

- 20 lineas fijas.
- Las lineas pagan de izquierda a derecha desde el reel 1.
- 3, 4 o 5 simbolos consecutivos pagan segun tabla.
- `wild` sustituye simbolos normales y tambien puede pagar como simbolo propio.
- Las lineas ganadoras se dibujan sobre la grilla al terminar el giro.
- Cada giro descuenta la apuesta del saldo y acredita la ganancia resultante.
- Jackpots mostrados: Minor = apuesta x20, Major = apuesta x100, Grand = apuesta x1000.
- 4 wilds en la grilla activan el modo bonus.

## Modo bonus

- Activacion: 4 o mas wilds en un giro normal.
- Premio inicial: 8 giros gratis.
- Retrigger: 4 o mas wilds dentro del bonus agregan 3 giros gratis.
- Los giros gratis usan la apuesta que activo el bonus y no descuentan saldo.
- Durante bonus pueden aparecer `item_bonus_x*`; estos simbolos sustituyen como comodines.
- Si una linea ganadora atraviesa un bonus, la linea se multiplica por el valor del item.
- El contador de giros gratis se muestra dentro de la escena durante la ronda.

## Zonas interactivas iniciales

| Zona | Centro | Area | Estado actual |
|---|---:|---:|---|
| Grand | `(332, 144)` | `209x28` | Apuesta x1000 |
| Major | `(970, 147)` | `191x26` | Apuesta x100 |
| Minor | `(970, 76)` | `191x26` | Apuesta x20 |
| Apuesta | `(427, 657)` | `91x48` | Empieza en `0$` |
| Bajar apuesta | `(347, 654)` | `64x61` | Baja de `10$` en `10$` |
| Subir apuesta | `(507, 654)` | `64x61` | Sube de `10$` en `10$` |
| Autospin | `(849, 653)` | `64x61` | Abre modal de 10/25/50 giros |
| SPIN | `(995, 654)` | `155x70` | Gira los 5 reels, descuenta saldo y calcula ganancia |
| Ganancia | `(674, 656)` | `152x50` | Muestra la ganancia del ultimo tiro |
| Ayuda | `(1193, 53)` | `64x61` | Abre modal de reglas |
| Musica | `(1196, 132)` | `64x61` | Activa/desactiva musica procedural |

## Animacion de spin

- Los simbolos ya no caen desde fuera de la pantalla.
- Cada reel tiene una ventana con mascara (`overflow: hidden`) dentro del hueco de la grilla.
- Los 5 reels arrancan juntos y se detienen en secuencia de izquierda a derecha.
- La tira de cada reel se genera al inicio del spin y rota como cinta fija; no se cambian simbolos durante el giro.

## Animacion de Wild

- Si un reel se detiene con `item_wild.png`, el simbolo final late, brilla y lanza chispas sobre su celda.
- Cuando aparece un wild, todos los reels que siguen girando aumentan velocidad en vivo.
- El brillo y las lineas de suspense solo se muestran en el proximo reel que esta por resolverse.
- Si uno de esos reels tambien trae wild, todos los reels restantes suben otro nivel de intensidad.
- Al encadenar wilds se dispara suspense; con 4 wilds se activa bonus o retrigger.

## Pendiente

Ajustes finos de balance/RTP y pulido de la presentacion final de la ronda bonus.

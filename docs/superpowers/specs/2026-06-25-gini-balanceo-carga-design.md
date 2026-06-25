# Gini — balanceo de carga en los recomendadores (#5) — Diseño

Fecha: 2026-06-25
Estado: aprobado (brainstorming)

## Contexto

Los dos recomendadores (`RecomendadorService`) rankean candidatos por afinidad
(Jaccard sobre áreas) + carga normalizada:

- **Evaluadores** (`sugerirRevisores`): `score = w1·afinidad + w2·(1−cargaNorm) +
  w3·disponibilidad`, con `w1+w2+w3=1` (defaults 0.6/0.3/0.1; `disponibilidad`
  hoy es constante 1.0).
- **Orientadores** (`sugerirOrientadores`): `score = wo1·afinidad +
  wo2·(1−cargaNorm)`, con `wo1+wo2=1` (defaults 0.7/0.3).

`cargaNorm = carga/maxCarga`. El peso de la carga es **fijo**, sin importar qué
tan repartida está la carga entre los profes.

## Objetivo

Usar el **coeficiente de Gini** de la distribución de cargas del pool de
candidatos para **modular dinámicamente el peso del término de carga**: cuando la
carga está muy desbalanceada (Gini alto), el sistema le da más peso a "estar poco
cargado" para empujar hacia los profes menos ocupados; cuando ya está balanceada
(Gini bajo), domina la afinidad. Aplica a **ambos** recomendadores.

## Alcance

- Cálculo del Gini sobre el `cargas` map ya computado en cada recomendador.
- Modulación del peso de carga vía interpolación lineal con el Gini, en
  evaluadores y orientadores.
- Exposición del `gini` como dato informativo en la salida (factores/respuesta).
- NO cambia la afinidad (Jaccard), ni la disponibilidad, ni el pool de candidatos,
  ni la persistencia de `RecomendacionEvaluador` (solo se enriquece su `factores`).

## Cálculo del Gini

Sobre los valores de carga del pool de candidatos (lista `cargas`):

```
G = Σ_i Σ_j |x_i − x_j| / (2 · n² · μ)
```

con `μ` = media de las cargas. Casos borde:
- `n ≤ 1` → `gini = 0`.
- `μ == 0` (todos con carga 0) → `gini = 0`.
- Resultado acotado a `[0, 1]`.

Método nuevo privado `gini(Collection<Long> cargas)` en `RecomendadorService`,
reutilizado por ambos caminos.

## Modulación del peso de carga

Parámetros nuevos `@Value`, con defaults:
- `academconnect.algoritmo.carga.wmin = 0.2`
- `academconnect.algoritmo.carga.wmax = 0.6`

Sea `g = gini(cargas)`. La fracción del "bloque afinidad+carga" que va a la carga
es `f = wmin + (wmax − wmin)·g` (∈ [wmin, wmax]).

### Evaluadores
El bloque afinidad+carga vale `w1 + w2`; `disponibilidad` conserva `w3`:
```
wCargaEff = (w1 + w2) · f
wAfinEff  = (w1 + w2) − wCargaEff
score = wAfinEff·afinidad + wCargaEff·(1 − cargaNorm) + w3·disponibilidad
```
Con `g=0` el bloque se reparte ~80/20 hacia afinidad; con `g=1`, ~40/60 hacia
carga. El total sigue sumando 1 (`wAfinEff + wCargaEff + w3 = w1+w2+w3 = 1`).

### Orientadores
Los dos términos suman 1 (`wo1+wo2`):
```
wCargaEff = f
wAfinEff  = 1 − f
score = wAfinEff·afinidad + wCargaEff·(1 − cargaNorm)
```

El `gini` se calcula **una vez por corrida** (no por candidato) y se pasa al
método de puntuación de cada candidato.

## Exposición informativa

- **Evaluadores**: el JSON `factores` que ya persiste `RecomendacionEvaluador`
  (`{afinidad, carga_norm, disponibilidad}`) gana `gini` y los pesos efectivos:
  `{..., "gini": g, "w_afin_eff": ..., "w_carga_eff": ...}`. El
  `SugerenciaEvaluadorResponse` queda igual (no se agregan campos al DTO en esta
  etapa — YAGNI; el dato vive en `factores`).
- **Orientadores**: `SugerenciaOrientadorResponse` no persiste factores; se deja
  igual (el ranking ya refleja la modulación). Opcional/diferido: agregar `gini`
  al response si la UI lo pide.

## Casos borde

- Pool vacío o de 1 candidato → `gini = 0` → comportamiento = pesos base con
  `f = wmin` (carga pesa lo mínimo). Coherente.
- Todas las cargas iguales (incl. todas 0) → `gini = 0`.
- `maxCarga = 0` → `cargaNorm = 0` para todos (sin cambios respecto a hoy).
- `wmin`/`wmax` mal configurados (wmin > wmax) → no se valida en runtime; los
  defaults son correctos. (Configuración de operador, fuera de validación.)

## Tests

### Backend (`RecomendadorServiceTests`)
- `gini()` (test directo del helper): distribución uniforme → 0; un solo no-cero →
  cercano a 1; lista vacía / n=1 / μ=0 → 0; valor conocido para una distribución
  chica (ej. [0, 0, 4] → G calculable a mano).
- Evaluadores: con cargas muy desbalanceadas, el candidato de **menor carga e
  igual afinidad** rankea por encima de lo que rankearía con el peso fijo
  (verificar que el orden cambia respecto al peso base, o que `wCargaEff` sube con
  el Gini). Con cargas balanceadas (gini≈0), el orden lo domina la afinidad.
- Orientadores: análogo (igual afinidad, cargas desbalanceadas → gana el menos
  cargado).
- `factores` JSON de evaluadores incluye `gini`.
- Regresión: los tests existentes de ranking siguen pasando (ajustando
  expectativas si el peso efectivo cambió el orden en algún fixture).

### Frontend
- Sin cambios de UI en esta etapa (el dato `gini` vive en `factores`, no se
  renderiza). No hay tareas frontend.

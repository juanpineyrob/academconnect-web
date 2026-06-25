# Pipeline multi-instancia de evaluación (4b) — Diseño

Fecha: 2026-06-25
Estado: aprobado (brainstorming)

## Contexto

4a dejó configurable, por tipo de trabajo, una lista ordenada de instancias de
evaluación (`InstanciaEvaluacionConfig`: tipo, orden, nombre,
evaluadoresRequeridos). Pero el pipeline de evaluación sigue siendo de **una sola
ronda**: la banca (#2) es por trabajo, y `EvaluacionService.agregarVeredicto`
promedia las asignaciones de `(trabajo, versión)` y fija `Trabajo.estado` =
APROBADO/RECHAZADO directamente.

El proceso real (ej. TCC de la facultad): 2 instancias, cada una con su banca
(profes que pueden variar), evaluadas por separado; la instancia 1 es
**habilitante** de la 2 (el alumno no presenta la 2 si no aprobó la 1); si
reprueba una instancia, la rehace con banca nueva. Esto varía por institución, así
que la conducta se **configura por tipo de trabajo**.

## Objetivo

Insertar el concepto de **instancia de evaluación** entre el trabajo y las
asignaciones: cada instancia tiene su propia banca, su propio veredicto
APROBADA/REPROBADA, reintentos, y la secuencia avanza al aprobar. El estado del
trabajo se deriva de sus instancias.

## Decisiones (del brainstorming)

- **Materialización**: secuencial bajo demanda. Existe solo la instancia activa;
  al aprobarla se materializa la siguiente.
- **Reintento**: al reprobar, la instancia queda REPROBADA (histórico inmutable)
  y se crea una **nueva** `InstanciaEvaluacion` del mismo config con `intento+1`.
- **Tope de reintentos**: `maxIntentos` configurable **por instancia**
  (`InstanciaEvaluacionConfig`). Agotado sin aprobar → trabajo RECHAZADO.
- **Gating secuencial**: flag `secuencial` configurable **por tipo de trabajo**
  (`TipoTrabajoConfig`). `true` (default, caso TCC): aprobar la instancia N
  habilita la N+1. `false`: instancias independientes; el trabajo cierra APROBADO
  cuando todas las instancias config están aprobadas.
- **Configuración**: el administrador edita `secuencial` y `maxIntentos` desde el
  **panel de tipos de trabajo de 4a** (se extiende esa UI + endpoint; no se crea
  panel nuevo). El tipo aplica a todos sus trabajos.
- **Veredicto del trabajo**: APROBADO al cerrarse (aprobada) la última instancia
  de la config; RECHAZADO si una instancia agota `maxIntentos`; mientras avanza,
  EN_EVALUACION.

## Compatibilidad

Tipo **sin instancias configuradas** → el pipeline cae al comportamiento de
**ronda única actual** (la banca y el veredicto operan a nivel trabajo como hoy).
Las `Asignacion` viejas (sin instancia) siguen funcionando: la FK a instancia es
nullable, y `agregarVeredicto` mantiene su rama legacy cuando la asignación no
tiene instancia.

## Modelo (backend)

### Extensiones a la config (4a)
- `InstanciaEvaluacionConfig.maxIntentos` — int, not null, default 1, ≥ 1.
- `TipoTrabajoConfig.secuencial` — boolean, not null, default true.
- Migración Flyway que agrega ambas columnas (con defaults). Los DTOs/servicio/UI
  admin de 4a se extienden para leer/escribir estos campos.

### Nueva entidad `InstanciaEvaluacion` (extends `BaseEntity`)
Tabla `instancia_evaluacion`:
- `trabajo` — `@ManyToOne` not null.
- `instanciaConfig` — `@ManyToOne InstanciaEvaluacionConfig` not null (de qué
  instancia del tipo es materialización).
- `orden` — int (copiado del config, para ordenar sin join).
- `intento` — int, not null, ≥ 1.
- `estado` — enum `EstadoInstanciaEvaluacion`: `PENDIENTE`, `EN_CURSO`,
  `APROBADA`, `REPROBADA`.
- `puntajeAgregado` — `BigDecimal` nullable (se fija al cerrar).
- `cerradaEn` — `Instant` nullable.
- Índices: `(trabajo_id)`, y único parcial sobre la instancia "abierta" por
  trabajo+config para no materializar dos veces el mismo intento activo.

### `Asignacion`
- Gana FK nullable `instancia_evaluacion_id` (`@ManyToOne`). Las nuevas
  asignaciones (creadas al aceptar una solicitud de evaluación de una instancia)
  la llevan; las viejas quedan null.

### `EstadoInstanciaEvaluacion` (enum nuevo)
`PENDIENTE` (materializada, sin banca completa), `EN_CURSO` (con asignaciones
activas), `APROBADA`, `REPROBADA`.

## Servicio: motor de instancias

Nuevo `InstanciaEvaluacionService` (o métodos en un servicio dedicado) que
concentra las transiciones, para no inflar `EvaluacionService`:

- **materializarInicial(trabajo)**: al asignarse orientador (trabajo →
  EN_DESARROLLO), crea la instancia activa = primer `InstanciaEvaluacionConfig`
  del tipo (orden 0), `intento=1`, estado PENDIENTE. Idempotente. Si el tipo no
  tiene config → no hace nada (ronda única).
- **instanciaActiva(trabajoId)**: la instancia no cerrada de menor orden.
- **alAprobar(instancia)**: marca APROBADA + `puntajeAgregado`/`cerradaEn`.
  - Si `secuencial=true`: si hay config con orden siguiente → materializa esa
    instancia (`intento=1`); si era la última → `trabajo` APROBADO.
  - Si `secuencial=false`: si todas las instancias config del tipo ya tienen una
    `InstanciaEvaluacion` APROBADA → `trabajo` APROBADO; si no, materializa la
    siguiente pendiente.
- **alReprobar(instancia)**: marca REPROBADA.
  - Si `intento < config.maxIntentos` → materializa nueva `InstanciaEvaluacion`
    del mismo config con `intento+1`, estado PENDIENTE.
  - Si `intento == maxIntentos` → `trabajo` RECHAZADO.

### Rework de `SolicitudEvaluacionService` (banca por instancia) — de #2
- `crear`: la solicitud apunta a la **instancia activa** del trabajo; N =
  `instanciaActiva.instanciaConfig.evaluadoresRequeridos` (ya no
  `TipoTrabajoConfig.evaluadoresDefault`). La banca (`countByTrabajoIdAndEstado`)
  se cuenta por instancia. Si el tipo no tiene instancias → comportamiento actual
  (banca por trabajo con `evaluadoresDefault`).
- `aceptar`: al crear la `Asignacion`, le setea `instanciaEvaluacion` = instancia
  activa, y la instancia pasa a EN_CURSO.

### Rework de `EvaluacionService.agregarVeredicto` (veredicto por instancia)
- Si la asignación tiene `instanciaEvaluacion`: al cerrarse la última asignación
  ACTIVA de **esa instancia**, promedia las evaluaciones de la instancia y llama a
  `alAprobar`/`alReprobar` del motor (no toca `Trabajo.estado` directamente — eso
  lo decide el motor).
- Si la asignación NO tiene instancia (legacy): mantiene la rama actual (veredicto
  a nivel trabajo/versión).

## Frontend

### Alumno — `mis-trabajos-detalle-page`
El bloque "Banca evaluadora" pasa a mostrar la **instancia activa** (nombre,
intento, estado) y su progreso de banca; opera sobre la instancia activa. Lista
las instancias del trabajo con su estado (APROBADA/REPROBADA/EN_CURSO) e intento.
Al aprobarse una instancia, aparece la siguiente; al reprobar, aparece el nuevo
intento.

### Evaluador — cola/evaluar
Sin cambios estructurales (sigue operando por `Asignacion`). La pantalla puede
mostrar a qué instancia pertenece la asignación (dato informativo).

### Admin — panel de tipos de trabajo (extiende 4a)
El editor de 4a gana: un toggle `secuencial` a nivel tipo, y un campo
`maxIntentos` por fila de instancia.

## Casos borde

- Tipo sin instancias → ronda única (compat total con el pipeline actual).
- Materialización idempotente (no duplicar la instancia activa).
- Veredicto de instancia solo cuando se cerraron todas sus asignaciones activas.
- `maxIntentos` agotado → trabajo RECHAZADO (no se materializa otro intento).
- `secuencial=true`: no se puede solicitar banca para la instancia N+1 si la N no
  está APROBADA (la activa es siempre la de menor orden no cerrada).
- `secuencial=false`: las instancias se materializan/avanzan sin gating; trabajo
  APROBADO al aprobarse todas.
- Reintento preserva la instancia reprobada inmutable (histórico).

## Tests

### Backend
- Motor `InstanciaEvaluacionService`: materializarInicial (con/sin config,
  idempotente); alAprobar (→ siguiente; → trabajo APROBADO en la última;
  secuencial vs no); alReprobar (→ reintento con intento+1; → trabajo RECHAZADO al
  tope).
- `SolicitudEvaluacionService` reworked: banca dimensionada por
  `instanciaConfig.evaluadoresRequeridos`; asignación ligada a la instancia;
  fallback ronda única sin config.
- `EvaluacionService.agregarVeredicto`: rama por instancia (cierra la instancia,
  invoca el motor) y rama legacy (sin instancia).
- Config extendida: `maxIntentos`/`secuencial` round-trip por el endpoint admin.
- Migraciones aplican y `ddl-auto=validate` pasa (cubierto por `@SpringBootTest`).

### Frontend
- Detalle: muestra instancia activa + lista de instancias con estado/intento;
  opera sobre la activa.
- Admin: el editor lee/escribe `secuencial` y `maxIntentos`.

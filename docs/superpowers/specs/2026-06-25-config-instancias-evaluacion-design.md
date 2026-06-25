# Configuración de estructura de evaluaciones por tipo (4a) — Diseño

Fecha: 2026-06-25
Estado: aprobado (brainstorming)

## Contexto

El proceso de evaluación de una facultad puede tener **varias instancias** por
tipo de trabajo. Ejemplo real (TCC): **2 instancias** (TCC1 primer semestre, TCC2
segundo semestre), **cada una con 2 evaluadores**, invitados **por instancia** (la
banca puede variar entre instancias, e incluso entre un TCC1 reprobado y su
reintento). Cada instancia tiene su propio resultado APROBADO/REPROBADO y la
secuencia avanza al aprobar.

Hoy el modelo NO soporta esto: `TipoTrabajoConfig` tiene un solo
`evaluadoresDefault` (un número), y el pipeline de evaluación asume **una sola
ronda** por trabajo. Existe `TipoTrabajoConfigController`
(`/admin/tipos-trabajo-config`, upsert por tipo) pero **sin UI admin**.

## Alcance de este spec (4a)

Este spec cubre **solo la configuración**: un panel de administración donde se
define, por tipo de trabajo, la **estructura de instancias** (lista ordenada,
cada una con nombre y cantidad de evaluadores requeridos).

**NO incluye** (es el spec siguiente, 4b — pipeline multi-instancia):
materializar instancias por trabajo, banca/asignaciones por instancia, veredicto
APROBADO/REPROBADO por instancia, secuencia y reintento al reprobar, y la
agregación a nivel trabajo. 4a es la fundación que 4b consumirá.

## Restricción de compatibilidad

#2 ("el alumno elige evaluadores") lee `TipoTrabajoConfig.evaluadoresDefault`
para dimensionar la banca. 4a **mantiene `evaluadoresDefault` intacto y
funcionando**; agrega la config de instancias **al lado**. 4b migrará #2 a usar
las instancias. Así 4a no rompe nada del pipeline actual.

## Modelo (backend)

### Nueva entidad `InstanciaEvaluacionConfig` (extends `BaseEntity`)

Tabla `instancia_evaluacion_config`:
- `tipo` — `TipoTrabajo` (enum string), not null.
- `orden` — int, not null (0-based, contiguo por tipo).
- `nombre` — varchar(200), not null (ej. "TCC1 - Presentación").
- `evaluadoresRequeridos` — int, not null, ≥ 1.
- Unique `(tipo, orden)`.

Relación lógica uno-a-muchos desde el tipo (no se modela como `@OneToMany` en
`TipoTrabajoConfig` para evitar acoplar su ciclo de vida; se consulta por
`findByTipoOrderByOrden`).

### `TipoTrabajoConfig`

Sin cambios de columnas: conserva `modoEvaluacion` + `evaluadoresDefault`.

### Repositorio

`InstanciaEvaluacionConfigRepository`:
- `List<InstanciaEvaluacionConfig> findByTipoOrderByOrden(TipoTrabajo tipo)`
- `void deleteByTipo(TipoTrabajo tipo)` (o `deleteAllByTipo`) para el reemplazo.

### Migración Flyway `V28__instancia_evaluacion_config.sql`

- Crea la tabla (FKs n/a — `tipo` es enum string; columnas de auditoría de
  `BaseEntity`), con `UNIQUE (tipo, orden)` y `CHECK (evaluadores_requeridos >= 1)`.
- **Seed**: TCC → 2 instancias:
  - orden 0, nombre "TCC1", evaluadores_requeridos 2.
  - orden 1, nombre "TCC2", evaluadores_requeridos 2.
- Los demás tipos quedan sin instancias.

## API (admin)

Endpoint existente `/admin/tipos-trabajo-config`, todo `ADMINISTRADOR`:

- `GET` y `GET /{tipo}`: el `TipoTrabajoConfigResponse` ahora incluye
  `instancias: [{orden, nombre, evaluadoresRequeridos}]` (ordenadas por `orden`).
- `PUT /{tipo}`: el `TipoTrabajoConfigRequest` acepta, además de
  `modoEvaluacion` y `evaluadoresDefault`, una lista `instancias:
  [{nombre, evaluadoresRequeridos}]`. El servicio:
  1. Upsert del `TipoTrabajoConfig` (como hoy).
  2. **Reemplaza** la lista de instancias del tipo: borra las existentes e
     inserta las nuevas, asignando `orden = índice` en el array recibido.
  - El reemplazo es idempotente.

DTOs nuevos/extendidos: `InstanciaEvaluacionConfigDto(orden, nombre,
evaluadoresRequeridos)` para el response; `InstanciaEvaluacionConfigInput(nombre,
evaluadoresRequeridos)` para el request. `TipoTrabajoConfigResponse` y
`TipoTrabajoConfigRequest` ganan el campo `instancias`.

## Validación

- `nombre`: requerido, ≤ 200.
- `evaluadoresRequeridos`: ≥ 1.
- Lista `instancias` puede estar **vacía** (tipo sin estructura definida; 4b
  caerá al comportamiento de ronda única). `null` se trata como vacía.
- `orden` lo deriva el servidor del índice del array → contigüidad garantizada,
  el cliente no lo manda.

## Frontend (UI admin nueva)

Página `tipos-trabajo-config` en el feature admin (hoy inexistente):
- Lista los 5 tipos de trabajo; al seleccionar uno, carga su config
  (`GET /{tipo}`).
- Editor con: `modoEvaluacion` (select), `evaluadoresDefault` (number ≥ 1), y una
  **lista editable de instancias** (Reactive Forms `FormArray`): agregar, quitar,
  reordenar (subir/bajar), cada fila con `nombre` + `evaluadoresRequeridos`.
- Guardar → `PUT /{tipo}` con `modoEvaluacion`, `evaluadoresDefault`, y
  `instancias` en el orden visual.
- Ruta admin (`/admin/tipos-trabajo-config`, `roleGuard` `['ADMINISTRADOR']`) +
  link en el sidebar admin + (opcional) tarjeta en el dashboard admin.
- Standalone, OnPush, `inject()`, signals donde aplique, control flow nativo, sin
  `ngClass`/`ngStyle`. Debe pasar AXE/WCAG AA (inputs etiquetados, botones con
  aria-label en reordenar/quitar).

## Casos borde

- Tipo sin instancias → válido; el GET devuelve `instancias: []`.
- Reemplazo de lista idempotente (PUT con la misma lista no duplica).
- `evaluadoresRequeridos < 1` o `nombre` vacío → 400.
- Reordenar en la UI sólo cambia el orden del array enviado; el backend reasigna
  `orden`.

## Tests

### Backend
- `TipoTrabajoConfigService` (o nuevo servicio de instancias):
  - PUT con instancias crea/reemplaza la lista con `orden` 0..n.
  - PUT con lista vacía deja el tipo sin instancias.
  - GET incluye las instancias ordenadas.
  - Validaciones (nombre vacío, evaluadores < 1) → error.
  - `evaluadoresDefault` sigue intacto tras el PUT.
- Controller: autorización `ADMINISTRADOR`.
- Migración V28 aplica y `ddl-auto=validate` pasa (cubierto por `@SpringBootTest`);
  el seed deja TCC con 2 instancias.

### Frontend
- Servicio: `GET`/`PUT` pegan a las URLs correctas con el shape de `instancias`.
- Editor: carga las instancias en el FormArray; agregar/quitar/reordenar; guardar
  arma el payload en el orden visual.

# Recomendación de orientadores — Diseño

Fecha: 2026-06-24
Estado: aprobado (brainstorming)

## Contexto

Al crear un trabajo (estado `BORRADOR`) el estudiante puede invitar a un profesor
como orientador mediante el flujo de invitación existente
(`invitar-orientador-form` → `POST /api/invitaciones-orientacion`).

Hoy el form lista los profesores **alfabéticamente**: trae el listado con
`AdminService.listarProfesores()` y tiene un stub `scoreProfesor()` que siempre
devuelve `0` (la lista admin no expone áreas, así que no puede rankear).

El backend ya tiene un recomendador **de evaluadores** completo
(`RecomendadorService.sugerirRevisores`) con Jaccard sobre áreas + carga
normalizada. **No** existe nada equivalente para orientadores.

## Objetivo

Recomendar orientadores al alumno al invitar, en función de:

- **Especialización** del profesor (áreas temáticas — `UsuarioAreaTematica`).
- **Carga actual** (cantidad de trabajos que ya orienta en estado activo).

…sin perder la **libre elección**: el alumno puede elegir cualquier profesor.

## Alcance

- Solo el **orientador principal**. Coorientador (libre elección), selección de
  evaluadores por el alumno, y estructura de evaluaciones por tipo de trabajo son
  specs aparte.
- El **Gini** queda fuera: el balanceo de carga ya queda cubierto por
  `(1 − cargaNorm)`. Mirror del recomendador de evaluadores ya probado.
- Sin cambios en el flujo de invitación (la página padre sigue disparando
  `POST /api/invitaciones-orientacion` con el mismo payload).

## Modelo de score

```
score = wO1 · afinidad + wO2 · (1 − cargaNorm)
```

- `afinidad` = Jaccard(áreas del trabajo, áreas del profesor). Reusa el método
  `jaccard()` existente en `RecomendadorService`.
- `carga` = cantidad de trabajos donde el profesor es `orientador` y el trabajo
  está en estado **activo** (no `APROBADO`/`RECHAZADO`/`CANCELADO`).
- `cargaNorm = carga / maxCarga` (0 si `maxCarga == 0`).
- Pesos configurables nuevos, con defaults:
  - `academconnect.algoritmo.orientador.w1 = 0.7`
  - `academconnect.algoritmo.orientador.w2 = 0.3`
- **No hay factor de disponibilidad** (no aplica a orientadores).

## Backend

### Endpoint

`GET /api/me/trabajos/{id}/sugerir-orientadores`

- Autorización: `isAuthenticated()` + valida que el usuario sea el **estudiante
  dueño** del trabajo (mismo patrón de validación de propiedad que el resto de
  `MeTrabajoController`). No-dueño → `403`.
- Devuelve **todos los profesores activos rankeados** por `score` descendente
  (no top-k; el front decide cuántos resalta). Una sola fuente alimenta tanto
  "Recomendados" como el buscador "Todos".

### Servicio

`RecomendadorService.sugerirOrientadores(Long trabajoId)`:

1. Carga el trabajo; obtiene sus áreas.
2. Pool = `profesorRepository.findByActivo(true)`, excluyendo al orientador
   actual si el trabajo ya tuviera uno.
3. Calcula `carga` por candidato con un repo nuevo
   `TrabajoRepository.countByOrientadorIdAndEstadoNotIn(FINALIZADOS)`
   (o equivalente `...EstadoIn(activos)`).
4. Calcula `afinidad`, `cargaNorm`, `score` por candidato.
5. Ordena por `score` desc (desempate alfabético por nombre).
6. **No persiste** (a diferencia de `sugerirRevisores`, que guarda
   `RecomendacionEvaluador`): la sugerencia de orientador es efímera/asesora.

### DTO

`SugerenciaOrientadorResponse`:

```
id            : Long
nombre        : String
email         : String
areasNombres  : List<String>
cargaActiva   : long
afinidad      : BigDecimal   // 4 decimales
score         : BigDecimal   // 4 decimales
```

## Frontend

### Servicio

`MisTrabajosService.sugerirOrientadores(trabajoId)` → GET del endpoint anterior.

### `invitar-orientador-form`

- Elimina la dependencia de `AdminService.listarProfesores()` y el stub
  `scoreProfesor()` / el `ranked` calculado con el stub.
- Recibe el `trabajo` (ya lo recibe como `input`) y, al inicializar, hace el GET
  de sugerencias.
- Render:
  - **★ Recomendados**: top 3 como cards seleccionables (radio) con barra de
    afinidad + carga (ej. "IA, ML · 2 trabajos activos").
  - **Todos los profesores**: input de búsqueda por nombre + lista de radios con
    el resto.
  - Seleccionar cualquiera (recomendado o de la lista) setea `profesorId`. Se
    mantiene el campo `motivo`. Emite el mismo
    `{ profesorId, motivo }` → la página padre dispara la invitación sin cambios.
- Accesibilidad: `radiogroup` con label, input de búsqueda etiquetado, barra de
  afinidad con texto accesible. Debe pasar AXE / WCAG AA.

## Flujo de datos

```
Alumno abre el form (trabajo BORRADOR)
  → GET /api/me/trabajos/{id}/sugerir-orientadores
  → RecomendadorService puntúa todos los profesores activos
  → form muestra top recomendados + lista completa buscable
  → alumno selecciona (recomendado o libre) + motivo opcional
  → emite { profesorId, motivo }
  → POST /api/invitaciones-orientacion   (sin cambios)
```

## Casos borde

- Trabajo sin áreas → afinidad 0 para todos → el ranking cae a menor carga primero.
- `maxCarga == 0` → `cargaNorm = 0` para todos.
- Profesor sin áreas → afinidad 0 pero sigue apareciendo en "Todos".
- Trabajo que ya tiene orientador (reinvitación tras rechazo) → se excluye al
  orientador actual de las sugerencias.
- No-dueño del trabajo → 403.
- Pool de profesores vacío → mensaje en el form, sin invitación posible.

## Tests

### Backend
- `RecomendadorService.sugerirOrientadores`:
  - Afinidad Jaccard correcta sobre áreas.
  - Ranking por carga (menor carga primero a igual afinidad).
  - Exclusión del orientador actual.
  - Pool vacío / sin áreas / `maxCarga == 0`.
- Controller: solo el dueño accede (403 para no-dueño).

### Frontend
- El form trae sugerencias al inicializar.
- Renderiza top recomendados + lista completa.
- El buscador filtra por nombre.
- La selección (recomendado o libre) emite el payload correcto `{ profesorId, motivo }`.

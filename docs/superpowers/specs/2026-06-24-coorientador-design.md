# Solicitud de coorientador — Diseño

Fecha: 2026-06-24
Estado: aprobado (brainstorming)

## Contexto

Un trabajo puede tener un **orientador** (profesor de la institución) y,
opcionalmente, un **coorientador**. Hoy:

- La entidad `Coorientador` existe (`trabajo`, `usuario`, `rolDescrito`,
  `desde`, `hasta`) y `CoorientadorRepository` también, pero **no hay API ni UI**
  para solicitar/asignar un coorientador.
- El mapper ya expone `coorientadoresNombres` en `TrabajoResponse` (solo lectura),
  así que el coorientador **ya se reflejaría al publicar** en el repositorio una
  vez que existan filas `Coorientador`.
- El flujo de orientador (`InvitacionOrientacion`) es invitación + aceptar/rechazar,
  pero está acoplado a fijar al orientador (al aceptar hace
  `trabajo.setOrientador(...)` y pasa el estado a `EN_DESARROLLO`), su FK es a
  `Profesor`, exige `BORRADOR` y "una sola pendiente", y aceptar/rechazar son
  `PROFESOR`-only.

## Objetivo

Permitir que el estudiante **solicite un coorientador** mediante el sistema, con la
misma lógica de invitación que el orientador (invitación + aceptar/rechazar), donde
el invitado puede ser un **profesor o un externo** ya registrado.

## Decisiones (del brainstorming)

- **Pool**: profesor **o** externo (ambos `Usuario` ya registrados y activos). El
  externo es un usuario de permisos limitados (sin perfil, no crea trabajos); su
  cuenta la crea un administrador — **fuera de alcance** de este proyecto. El
  orientador sigue siendo solo profesores.
- **Modelo**: invitación + aceptar/rechazar (misma lógica que orientador). El
  invitado (profesor o externo) se autentica para responder.
- **Cantidad**: **exactamente uno** por trabajo (máximo).
- **Prerrequisito**: el trabajo **ya debe tener orientador asignado** y estar en
  estado activo (no finalizado). El coorientador acompaña a un orientador.
- **`rolDescrito`/`hasta`**: no se capturan en esta etapa (YAGNI). Al aceptar se
  setea `desde = today`; `rolDescrito` y `hasta` quedan `null`.

## Alcance

- Solicitud de **un** coorientador (profesor o externo) vía invitación.
- NO incluye: recomendación (el coorientador es de libre elección), creación de
  cuentas de externos (la hace un admin, fuera de alcance), ni cambios en el flujo
  de orientador.

## Arquitectura

Flujo propio **`SolicitudCoorientacion`** (entidad + servicio + controller +
DTOs + mapper paralelos al de orientador), reusando el enum `EstadoInvitacion`.
Se descarta extender `InvitacionOrientacion` (mezclaría precondiciones,
multiplicidad y side-effects distintos, cambiaría el FK `Profesor→Usuario` y
arriesgaría el flujo de orientador que ya funciona).

## Backend (repo `academconnect`)

### Entidad `SolicitudCoorientacion` (extends `BaseEntity`)

- `trabajo` — `@ManyToOne` not null.
- `invitado` — `@ManyToOne Usuario` not null (profesor o externo).
- `estado` — `EstadoInvitacion` (reusa: PENDIENTE/ACEPTADA/RECHAZADA/CANCELADA).
- `motivo` — text (mensaje opcional del estudiante).
- `respuesta` — text (respuesta opcional del invitado).
- `resueltaEn` — `Instant`.

Tabla: `solicitud_coorientacion`.

### Repositorio

`SolicitudCoorientacionRepository`:
- `boolean existsByTrabajoIdAndEstado(Long trabajoId, EstadoInvitacion estado)`
- `List<SolicitudCoorientacion> findByTrabajoId(Long trabajoId)`
- consultas para "recibidas" del invitado (por `invitado.id`, paginado y/o por
  estado), siguiendo el patrón de `InvitacionOrientacionRepository`.

`CoorientadorRepository` ya tiene `findByTrabajoId`; agregar si hace falta
`long countByTrabajoId(Long trabajoId)` para validar "ya tiene coorientador".

### Servicio `SolicitudCoorientacionService`

- **crear(request, estudianteId)**:
  - El estudiante es dueño del trabajo (si no → `BusinessException`).
  - `trabajo.getOrientador() != null` (si no → "El trabajo aún no tiene orientador").
  - `trabajo.getEstado().esActivo()` (si finalizado → error).
  - `coorientadorRepository.countByTrabajoId(...) == 0` (si no → "ya tiene coorientador").
  - sin solicitud PENDIENTE para el trabajo (si no → "ya hay una solicitud pendiente").
  - invitado existe, activo, rol `PROFESOR` o `EXTERNO`, distinto del orientador y
    del estudiante.
  - crea `SolicitudCoorientacion` PENDIENTE con `motivo`; publica evento de actividad.
- **aceptar(id, respuesta, usuarioId)**:
  - solo el `invitado` puede aceptar; estado debe ser PENDIENTE.
  - **re-valida**: trabajo sigue activo, con orientador, y sin coorientador (evita
    carrera). Si ya no aplica → `BusinessException`.
  - marca ACEPTADA (+ `respuesta`, `resueltaEn`) y **crea un `Coorientador`**
    (`trabajo`, `usuario = invitado`, `desde = LocalDate.now()`). **No** cambia
    `trabajo.estado` ni `trabajo.orientador`.
  - publica evento de actividad.
- **rechazar(id, respuesta, usuarioId)**: solo el invitado; PENDIENTE → RECHAZADA.
- **cancelar(id, estudianteId)**: solo el dueño; PENDIENTE → CANCELADA.
- **listarRecibidas(usuarioId, ...)** y **listarPorTrabajo(trabajoId)**.

### Endpoints `/api/solicitudes-coorientacion`

- `POST` — `@PreAuthorize("hasRole('ESTUDIANTE')")` — crear.
- `POST /{id}/aceptar` — `@PreAuthorize("hasRole('PROFESOR') or hasRole('EXTERNO')")`.
- `POST /{id}/rechazar` — `@PreAuthorize("hasRole('PROFESOR') or hasRole('EXTERNO')")`.
- `POST /{id}/cancelar` — `@PreAuthorize("hasRole('ESTUDIANTE')")`.
- `GET` (recibidas del invitado, paginado) — `@PreAuthorize("hasRole('PROFESOR') or hasRole('EXTERNO')")`.
- `GET /trabajos/{trabajoId}` (por trabajo) — `isAuthenticated()` + el caller debe
  ser participante (dueño/orientador/invitado) según el patrón del proyecto.

DTOs: `SolicitudCoorientacionRequest(trabajoId, usuarioId, motivo)`,
reusar `RespuestaInvitacionRequest`, `SolicitudCoorientacionResponse(...)`. Mapper
dedicado.

### Repositorio público

Sin cambios: `coorientadoresNombres` ya está en `TrabajoResponse`/`TrabajoMapper`;
el coorientador aparece automáticamente al publicar.

## Frontend (repo `academconnect-web`)

### Servicio `solicitud-coorientacion.service.ts`

`crear`, `aceptar`, `rechazar`, `cancelar`, `listarRecibidas`, `listarPorTrabajo`,
con modelos en `solicitud-coorientacion.models.ts`.

### Lado alumno — `mis-trabajos-detalle-page`

Cuando el trabajo tiene orientador, está activo, y no tiene coorientador ni
solicitud pendiente: bloque **"Solicitar coorientador"**:
- Selector **buscable** de elegibles = profesores + externos (de
  `GET /api/profesores` y `GET /api/externos`), **sin ranking**, excluyendo al
  orientador actual.
- `motivo` opcional.
- Al enviar → `POST`. Muestra el estado de la solicitud pendiente y, una vez
  aceptada, el coorientador asignado.

### Lado invitado — vista de recibidas

Extender la vista de "invitaciones recibidas" (`invitaciones-recibidas-page`) para
incluir las solicitudes de coorientación con aceptar/rechazar, accesible a
`PROFESOR` **y** `EXTERNO` (ajustar el route guard / sidebar para que el externo
acceda).

## Casos borde

- Doble solicitud (PENDIENTE existente) → error.
- Trabajo ya con coorientador → error.
- Trabajo finalizado (APROBADO/RECHAZADO/CANCELADO) → error.
- Trabajo sin orientador → error.
- Invitado == orientador, o invitado == estudiante → error.
- Invitado inactivo o rol inválido → error.
- Re-validación en `aceptar` por si el estado cambió entre crear y aceptar.
- No-dueño cancela / no-invitado acepta → error de autorización.

## Tests

### Backend
- `SolicitudCoorientacionService`:
  - crear: happy path + cada validación (sin orientador, finalizado, ya tiene
    coorientador, ya hay pendiente, invitado == orientador/estudiante, invitado
    inactivo/rol inválido).
  - aceptar: crea `Coorientador`, no toca estado/orientador; re-validación falla si
    el contexto cambió; solo el invitado.
  - rechazar / cancelar: transiciones y autorización.
- Controller: autorización por rol (ESTUDIANTE vs PROFESOR|EXTERNO) y dueño/invitado.

### Frontend
- Servicio: cada método pega a la URL correcta.
- Lado alumno: el bloque aparece solo cuando corresponde; el selector lista
  profesores+externos y excluye al orientador; enviar arma el payload correcto.
- Lado invitado: la solicitud aparece en recibidas; aceptar/rechazar llaman al
  endpoint correcto.

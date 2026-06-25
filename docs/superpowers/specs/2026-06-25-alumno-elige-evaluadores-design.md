# El alumno elige sus evaluadores — Diseño

Fecha: 2026-06-25
Estado: aprobado (brainstorming)

## Contexto

Hoy las asignaciones de evaluadores se crean **solo por ADMIN**
(`POST /api/asignaciones`, `@PreAuthorize hasRole('ADMINISTRADOR')`), eligiendo
explícitamente trabajo + versión + evaluador + template + vencimiento. El
recomendador de evaluadores (`RecomendadorService.sugerirRevisores`, Jaccard +
carga + conflicto de interés) ya existe pero también es ADMIN-only
(`POST /api/trabajos/{id}/sugerir-revisores`). El lado evaluador es solo lectura
(`/evaluador/me/asignaciones`).

La regla del proyecto es: **el alumno elige sus evaluadores**, conservando la
libre elección. La forma acordada es la misma que orientador/coorientador: una
**solicitud** (invitación) con aceptar/rechazar y respuesta opcional.

## Objetivo

Que el estudiante arme su banca evaluadora invitando evaluadores (recomendados o
de libre elección). Cada evaluador acepta o rechaza; **al aceptar se crea la
`Asignacion`** correspondiente (reutilizando la lógica existente).

## Decisiones (del brainstorming)

- **Quién dispara**: el alumno invita directo, sin gate del orientador. Cada
  evaluador acepta/rechaza (idéntico al flujo de orientación/coorientación).
- **Cantidad (N)** = `TipoTrabajoConfig.evaluadoresDefault` del tipo del trabajo.
  El alumno puede invitar mientras `(asignaciones activas + solicitudes
  pendientes) < N`. La banca se completa cuando hay N asignaciones activas.
- **Una sola ronda** de evaluación. Las instancias/bancas múltiples
  (ej. TCC = 2 semestres) son el spec **#4**, fuera de alcance.
- **Template**: los templates/rúbricas son **generales** (no por tipo/área; el
  `scope` está deprecado). No existe "template por defecto". Este spec agrega un
  flag `es_por_defecto` y **siembra un template genérico por defecto**; la
  `Asignacion` creada al aceptar congela el snapshot de ese template. La pantalla
  del evaluador para elegir/crear rúbrica al entrar a evaluar es una **feature
  separada** (no incluida acá).
- **Versión a evaluar** = la última versión del trabajo al momento de aceptar.
- **Vencimiento** = `null` en el prototipo.

## Alcance

Incluye: solicitud de evaluación (crear/aceptar/rechazar/cancelar/listar),
creación de `Asignacion` al aceptar, exposición dueño-only del recomendador, flag
+ seed de template por defecto, UI del alumno y del evaluador.

NO incluye: la pantalla de selección/creación de rúbrica del evaluador al entrar
a evaluar (feature separada), instancias/bancas múltiples por tipo (#4), Gini (#5).

## Arquitectura

Flujo propio **`SolicitudEvaluacion`** (entidad + repo + DTOs + mapper + servicio
+ controller) paralelo a `SolicitudCoorientacion`, reusando el enum
`EstadoInvitacion`. Diferencia central: al **aceptar** se crea una `Asignacion`
reutilizando `AsignacionService.crear(AsignacionRequest)` — que ya congela el
snapshot del template, publica el evento `ASIGNACION_CREADA` y mueve el trabajo a
`EN_EVALUACION`.

## Backend (repo `academconnect`)

### Template por defecto

- `TemplateEvaluacion`: agregar `boolean esPorDefecto` (columna `es_por_defecto`,
  default false).
- Migración Flyway: agregar la columna y **sembrar un template genérico por
  defecto** (`es_por_defecto = true`, `activo = true`, `autor` null, `criterios`
  JSON con criterios genéricos, `umbral_aprobacion` p. ej. 6.00). Debe existir
  exactamente uno con `es_por_defecto = true`.
- `TemplateEvaluacionRepository`:
  `Optional<TemplateEvaluacion> findFirstByEsPorDefectoTrueAndActivoTrue()`.

### Entidad `SolicitudEvaluacion` (extends `BaseEntity`)

- `trabajo` — `@ManyToOne` not null.
- `invitado` — `@ManyToOne Usuario` not null (evaluador: profesor o externo).
- `estado` — `EstadoInvitacion` (PENDIENTE/ACEPTADA/RECHAZADA/CANCELADA).
- `motivo` — text (mensaje del estudiante).
- `respuesta` — text (respuesta del evaluador).
- `resueltaEn` — `Instant`.

Tabla `solicitud_evaluacion` (migración Flyway, misma forma que
`solicitud_coorientacion`: FKs, índices, índice único parcial de pendiente por
trabajo+invitado para no duplicar invitaciones al mismo evaluador).

### Repositorios

`SolicitudEvaluacionRepository`:
- `boolean existsByTrabajoIdAndInvitadoIdAndEstado(Long, Long, EstadoInvitacion)`
- `long countByTrabajoIdAndEstado(Long trabajoId, EstadoInvitacion estado)`
- `List<SolicitudEvaluacion> findByTrabajoIdOrderByCreatedAtDesc(Long)`
- `Page<...> findByInvitadoIdAndEstadoOrderByCreatedAtDesc(Long, EstadoInvitacion, Pageable)`
- `Page<...> findByInvitadoIdAndEstadoNotOrderByCreatedAtDesc(Long, EstadoInvitacion, Pageable)`

`AsignacionRepository`: agregar
`long countByTrabajoIdAndEstado(Long trabajoId, EstadoAsignacion estado)`
(para contar la banca activa).

### Servicio `SolicitudEvaluacionService`

- **crear(request, estudianteId)**:
  - dueño del trabajo.
  - `trabajo.getOrientador() != null`.
  - estado `EN_DESARROLLO` o `EN_EVALUACION` (activo, no finalizado).
  - existe al menos una versión (`versionamientoRepository.findFirstByTrabajoIdOrderByNumeroVersionDesc`).
  - banca no completa: `asignacionRepository.countByTrabajoIdAndEstado(trabajoId, ACTIVA)
    + repository.countByTrabajoIdAndEstado(trabajoId, PENDIENTE) < N`, con
    `N = TipoTrabajoConfig.evaluadoresDefault` del tipo (si no hay config para el
    tipo → error pidiendo configurarla).
  - invitado existe, activo, rol PROFESOR/EXTERNO, ≠ orientador, ≠ estudiante, no
    es coorientador del trabajo (`coorientadorRepository.findByTrabajoId`), sin
    conflicto de interés (`conflictoRepository.existsByTrabajoIdAndEvaluadorId`).
  - sin solicitud PENDIENTE existente para ese invitado en ese trabajo, y sin
    asignación activa de ese evaluador en ese trabajo.
  - crea `SolicitudEvaluacion` PENDIENTE; publica evento de actividad si el patrón
    lo permite (si no hay `TipoActividad` adecuado, omitir y anotar — igual que en
    coorientador).
- **aceptar(id, respuesta, usuarioId)**:
  - solo el `invitado`; estado PENDIENTE.
  - re-valida: trabajo activo, con orientador, banca no completa.
  - busca última versión y el template por defecto
    (`findFirstByEsPorDefectoTrueAndActivoTrue`; si no existe → error).
  - **crea la `Asignacion`** llamando
    `asignacionService.crear(new AsignacionRequest(trabajoId, versionId,
    invitadoId, defaultTemplateId, null))` — esto congela el snapshot, dispara el
    evento `ASIGNACION_CREADA` y pasa el trabajo a `EN_EVALUACION`.
  - marca la solicitud ACEPTADA (+ respuesta, resueltaEn).
- **rechazar(id, respuesta, usuarioId)**: solo invitado; PENDIENTE → RECHAZADA.
- **cancelar(id, estudianteId)**: solo dueño; PENDIENTE → CANCELADA.
- **listarRecibidasPaginadas(usuarioId, soloPendientes, pageable)** y
  **listarPorTrabajo(trabajoId)**.

### Endpoints `/api/solicitudes-evaluacion`

Misma matriz que coorientador:
- `POST` (crear) — `hasRole('ESTUDIANTE')`.
- `POST /{id}/aceptar`, `POST /{id}/rechazar` — `hasRole('PROFESOR') or hasRole('EXTERNO')`.
- `POST /{id}/cancelar` — `hasRole('ESTUDIANTE')`.
- `GET` (recibidas del invitado, paginado, param `estado`) — `hasRole('PROFESOR') or hasRole('EXTERNO')`.
- `GET /trabajos/{trabajoId}` (por trabajo) — `isAuthenticated()`.

DTOs: `SolicitudEvaluacionRequest(trabajoId, usuarioId, motivo)`, reusar
`RespuestaInvitacionRequest`,
`SolicitudEvaluacionResponse(id, trabajoId, trabajoTitulo, invitadoId,
invitadoNombre, estado, motivo, respuesta, resueltaEn, createdAt)`. Mapper
dedicado.

### Recomendador dueño-only

Nuevo endpoint en `MeTrabajoController`:
`GET /api/me/trabajos/{id}/sugerir-evaluadores` — `hasRole('ESTUDIANTE')` + valida
dueño (patrón de `buscarPorId`). Llama
`recomendadorService.sugerirRevisores(id, N)` con `N = evaluadoresDefault`.
Devuelve `List<SugerenciaEvaluadorResponse>` (ya existe).

## Frontend (repo `academconnect-web`)

### Servicio `solicitud-evaluacion.service.ts`

`crear`, `aceptar`, `rechazar`, `cancelar`, `listarRecibidas`, `listarPorTrabajo`,
`sugerirEvaluadores(trabajoId)`. Modelos en `solicitud-evaluacion.models.ts`
(`SolicitudEvaluacion`, `SolicitudEvaluacionRequest`, y reuso de
`EvaluadorSugerido` = el modelo del recomendador, equivalente a
`SugerenciaEvaluadorResponse`).

### Lado alumno — `mis-trabajos-detalle-page`

Bloque **"Solicitar evaluadores"** cuando: el trabajo tiene orientador, está
activo (EN_DESARROLLO/EN_EVALUACION), tiene al menos una versión, y la banca no
está completa.
- Muestra el **progreso de la banca**: "Necesitás N · Aceptados X · Pendientes Y".
- **★ Recomendados** (del recomendador, top por score) + **buscador** de
  evaluadores libres (profesores + externos), excluyendo orientador, coorientador,
  ya invitados/asignados y el alumno.
- Enviar solicitud (con motivo opcional) mientras `X + Y < N`.
- Lista las solicitudes y su estado; permite cancelar pendientes.

### Lado evaluador — página de recibidas

Página **"Solicitudes de evaluación"** (paralela a
`coorientaciones-recibidas-page`): pestañas Pendientes/Histórico, paginación,
aceptar/rechazar con respuesta opcional. Ruta con guard de roles
`['PROFESOR','EXTERNO']`, registrada en `app.routes.ts` y link en el sidebar.

## Casos borde

- Banca completa → no permite invitar (UI y backend).
- Trabajo sin orientador / sin versión / finalizado → error.
- Invitado == orientador, coorientador o estudiante; rol inválido; inactivo;
  conflicto de interés → error.
- Duplicado (solicitud pendiente o asignación activa del mismo evaluador) → error.
- Re-validación en `aceptar` (carrera: banca puede haberse completado entre
  invitar y aceptar).
- Sin template por defecto activo → error pidiendo configurarlo.
- No-dueño cancela / no-invitado acepta → error de autorización.

## Tests

### Backend
- `SolicitudEvaluacionService`: crear (happy + cada validación, incl. banca
  llena), aceptar (crea `Asignacion`, banca llena re-valida, solo invitado),
  rechazar/cancelar (transiciones + autorización), sin template por defecto.
- Controller: autorización por rol y dueño/invitado.
- `TemplateEvaluacionRepository.findFirstByEsPorDefectoTrueAndActivoTrue` devuelve
  el sembrado.
- La migración debe pasar `ddl-auto=validate` (tabla + columna) — cubierto por los
  `@SpringBootTest` existentes que bootean Flyway.

### Frontend
- Servicio: cada método pega a la URL correcta.
- Lado alumno: el bloque aparece solo cuando corresponde; progreso de banca
  correcto; recomendados + buscador excluyen no-elegibles; enviar arma el payload;
  no deja invitar con banca completa.
- Lado evaluador: la solicitud aparece en recibidas; aceptar/rechazar llaman al
  endpoint correcto.

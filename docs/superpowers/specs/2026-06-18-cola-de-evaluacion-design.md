# Cola de evaluación — Diseño

> **Estado:** spec aprobado en brainstorming (2026-06-18). Pendiente de plan de implementación.

**Goal:** Dar al evaluador (rol `PROFESOR` / `EXTERNO`) la cola de sus asignaciones de evaluación y la pantalla para evaluar un trabajo contra los criterios de su template. Hoy estos ítems del sidebar son placeholders muertos; el backend (F12–F14) ya expone toda la API.

**Tech stack:** Angular 21 (standalone, signals, OnPush, native control flow), Reactive Forms, SCSS con design tokens, Vitest (`@angular/build:unit-test`). Auth por cookie (`withCredentials: true`).

---

## Alcance

**Incluye:**
- Cola de asignaciones del evaluador (`/evaluaciones`) con tabs *Activas* / *Completadas*.
- Pantalla de evaluar (`/evaluaciones/:asignacionId`) con vista **split**: documento embebido a la izquierda, formulario de criterios a la derecha.
- Borrador local (`localStorage`) por asignación + diálogo de confirmación al enviar (acción irreversible).
- Modo read-only para asignaciones ya `COMPLETADA`.

**Fuera de alcance (features siguientes):** carga/stats del evaluador, sesiones síncronas, disponibilidad, reconocimientos, asignación/sugerencia de revisores (esto último es del admin).

---

## Contrato con el backend (ya existente)

| Operación | Endpoint | Notas |
|---|---|---|
| Listar asignaciones propias | `GET /evaluador/me/asignaciones?estado=&all=` → `List<AsignacionResponse>` | `estado` ∈ `ACTIVA`/`COMPLETADA`/`CANCELADA`; default sin filtro = `ACTIVA`. `@PreAuthorize('PROFESOR','EXTERNO')` |
| Cargar evaluación de una asignación | `GET /api/asignaciones/{asignacionId}/evaluacion` → `EvaluacionResponse` | Para el modo read-only de completadas |
| Enviar (completar) evaluación | `POST /api/evaluaciones` (`EvaluacionRequest`) | **Definitivo**: cierra la evaluación y puede gatillar la decisión del trabajo |
| Documento de la versión | `GET /api/trabajos/{trabajoId}/versiones/{versionamientoId}/documento` | Cookie auth; embebible directo |

**`AsignacionResponse`:** `id, trabajoId, trabajoTitulo, versionamientoId, versionNumero, evaluadorId, evaluadorNombre, templateSnapshot (String JSON), asignadaEn, vencimientoEn, estado, createdAt`.

**`templateSnapshot`** (JSON crudo): `{ "criterios": [ {codigo, nombre, tipo, peso, escalaMin, escalaMax, opciones?} ], "umbralAprobacion": number }`. `tipo` ∈ `ESCALA | SLIDER | SELECCION | BOOLEANO | TEXTO`. `opciones` solo en `SELECCION`.

**`EvaluacionRequest`:** `{ asignacionId, calificaciones: [{criterioCodigo, puntaje (BigDecimal ≥ 0), comentario, comentarioPrivado}], comentarioGeneral }`.

**`EvaluacionResponse`:** `{ id, asignacionId, estado, calificacionFinal, comentarioGeneral, calificaciones: [{id, criterioCodigo, puntaje, comentario, comentarioPrivado}], completadaEn, createdAt }`.

---

## Arquitectura y estructura de archivos

Feature nueva `src/app/features/evaluaciones/`, siguiendo el patrón de `mis-trabajos`:

```
features/evaluaciones/
├── evaluaciones.routes.ts          # /evaluaciones, /evaluaciones/:asignacionId
├── evaluaciones.service.ts         # cola + cargar evaluación + enviar + parseSnapshot
├── evaluaciones.models.ts          # tipos TS del contrato backend
├── evaluacion-form.builder.ts      # snapshot → FormArray tipado (servicio puro)
├── evaluacion-draft.store.ts       # borrador localStorage por asignación
├── cola-page/                      # cola-page.ts / .html / .scss
├── evaluar-page/                   # evaluar-page.ts / .html / .scss
└── components/
    ├── asignacion-card/            # item de la cola
    ├── criterio-field/             # @switch por tipo
    └── documento-viewer/           # <object>/<iframe> del PDF
```

**Routing** (registrado en `app.routes.ts` dentro del shell):

```ts
{ path: 'evaluaciones', canActivate: [authGuard, roleGuard],
  data: { roles: ['PROFESOR', 'EXTERNO'] }, loadComponent: … ColaPage,
  title: 'Evaluaciones · AcademConnect' }
{ path: 'evaluaciones/:asignacionId', canActivate: [authGuard, roleGuard],
  data: { roles: ['PROFESOR', 'EXTERNO'] }, canDeactivate: [unsavedGuard],
  loadComponent: … EvaluarPage, title: 'Evaluar · AcademConnect' }
```

**Sidebar** (`sidebar.ts`, `SECTIONS_EVALUADOR`):
- `{ label: 'Evaluaciones asignadas' }` → `{ label: 'Evaluaciones asignadas', route: '/evaluaciones', exact: false }`.
- Se elimina el placeholder `{ label: 'Bandeja de revisión' }` (duplicado conceptual de lo mismo).

---

## Modelos (`evaluaciones.models.ts`)

```ts
type EstadoAsignacion = 'ACTIVA' | 'COMPLETADA' | 'CANCELADA';
type CriterioTipo = 'ESCALA' | 'SLIDER' | 'SELECCION' | 'BOOLEANO' | 'TEXTO';

interface Asignacion {
  id: number; trabajoId: number; trabajoTitulo: string;
  versionamientoId: number; versionNumero: number;
  templateSnapshot: string;           // JSON crudo
  asignadaEn: string; vencimientoEn: string; estado: EstadoAsignacion;
}

interface Criterio {
  codigo: string; nombre: string; tipo: CriterioTipo;
  peso: number; escalaMin: number; escalaMax: number;
  opciones?: string[];                // solo SELECCION
}
interface TemplateSnapshot { criterios: Criterio[]; umbralAprobacion: number; }

interface CalificacionCriterio {
  criterioCodigo: string; puntaje: number;
  comentario: string; comentarioPrivado: boolean;
}
interface EvaluacionRequest {
  asignacionId: number; calificaciones: CalificacionCriterio[]; comentarioGeneral: string;
}
interface Evaluacion {              // read-only de completadas
  id: number; asignacionId: number; estado: string;
  calificacionFinal: number; comentarioGeneral: string;
  calificaciones: { criterioCodigo: string; puntaje: number; comentario: string; comentarioPrivado: boolean }[];
  completadaEn: string;
}
```

## Servicio (`evaluaciones.service.ts`)

`providedIn: 'root'`, `inject(HttpClient)`, `api = environment.apiBase`.

| Método | Llamada |
|---|---|
| `listarAsignaciones(estado?: EstadoAsignacion)` | `GET {api}/evaluador/me/asignaciones?estado=` |
| `cargarEvaluacion(asignacionId)` | `GET {api}/api/asignaciones/{id}/evaluacion` → `Evaluacion` |
| `enviarEvaluacion(req: EvaluacionRequest)` | `POST {api}/api/evaluaciones` |
| `parseSnapshot(json: string): TemplateSnapshot \| null` | helper puro con try/catch; valida que exista `criterios[]` |

El `documento-viewer` arma la URL del documento directamente (cookie auth); no requiere método de servicio.

---

## Form builder + `criterio-field` (opción A: field polimórfico)

**`evaluacion-form.builder.ts`** — servicio puro, sin estado. `buildForm(snapshot)` devuelve un `FormGroup` tipado:

```ts
FormGroup<{
  criterios: FormArray<FormGroup<{
    criterioCodigo: FormControl<string>;
    puntaje: FormControl<number | boolean | string | null>;
    comentario: FormControl<string>;
    comentarioPrivado: FormControl<boolean>;   // default true (espejo del DB)
  }>>;
  comentarioGeneral: FormControl<string>;
}>
```

Validadores aplicados por el builder según `tipo`:

| `tipo` | Control `puntaje` | Validación | Cuenta al promedio ponderado |
|---|---|---|---|
| `ESCALA` | number (stepper) | `required`, `min/max` = escalaMin..escalaMax | sí (× peso) |
| `SLIDER` | number (range) | igual a ESCALA | sí (× peso) |
| `SELECCION` | string (valor de `opciones`) | `required`, ∈ `opciones` | sí (× peso) — ver mapeo |
| `BOOLEANO` | boolean (toggle) | `required` | sí (false→escalaMin, true→escalaMax) × peso |
| `TEXTO` | string (textarea) | opcional | **no** (cualitativo, peso 0 al cálculo) |

**Mapeo SELECCION → puntaje:** las opciones se reparten linealmente en la escala — índice `0`→`escalaMin`, último→`escalaMax`. El backend solo exige un `puntaje` numérico.

**`criterio-field`** — componente presentacional, `OnPush`. `input()` del `Criterio` + el `FormGroup` del control; `@switch (criterio.tipo)` renderiza el input adecuado. Boilerplate compartido una sola vez: label, chip de peso, textarea de comentario, toggle "comentario privado / visible al estudiante". Accesible: cada input con `label`/`aria` asociado, slider con `aria-valuetext`. Acepta un `input()` `readonly` que deshabilita los controles (modo completada).

**Preview de nota** (en `EvaluarPage`, no en el field): `computed` sobre el `FormArray` que calcula el promedio ponderado de los criterios con peso > 0 y lo compara con `umbralAprobacion` → "Proyección: 7.2 / umbral 6.0 ✓ Aprobaría". Es ayuda visual; el backend recalcula y decide.

---

## UX de las páginas

### `ColaPage` (`/evaluaciones`)

- Header + dos **tabs**: *Activas* (default) / *Completadas*. Cambiar tab refetch `listarAsignaciones(estado)`.
- Lista de `asignacion-card`: `trabajoTitulo`, `v{versionNumero}`, fecha de asignación, **vencimiento**. Vencidas (solo en Activas, `vencimientoEn < now`) con badge de alerta en color de acento (no rojo puro, coherente con el feed). Click → `/evaluaciones/:asignacionId`.
- Estados: `loading` (skeletons como en otras listas), `empty` ("No tenés evaluaciones activas"), `error` (retry).
- `tab` y lista en signals; `vencida` derivado con `computed`.

### `EvaluarPage` (`/evaluaciones/:asignacionId`)

Layout **split**:
- **Izquierda:** `documento-viewer` con el PDF de la versión embebido (`<object>` con fallback a enlace de descarga si el navegador no lo renderiza).
- **Derecha:** cabecera (título, `v{N}`, vencimiento) + un `criterio-field` por criterio + textarea de comentario general + preview de nota proyectada + botón **Enviar evaluación**.
- **Responsive:** bajo ~900px el split se apila (documento colapsable arriba, formulario abajo).

**Modo según `asignacion.estado`** (resuelto al cargar):
- `ACTIVA` → formulario editable + borrador + submit.
- `COMPLETADA` → `cargarEvaluacion(id)`; `criterio-field` en read-only con los puntajes enviados + badge "Evaluación enviada el …". Sin submit.
- `CANCELADA` → aviso "Esta asignación fue cancelada", sin formulario.

**Borrador + envío:**
- `evaluacion-draft.store.ts`: key `eval-draft:{asignacionId}`. `valueChanges` con debounce ~500ms → guarda. Al cargar una ACTIVA, si hay borrador lo restaura con aviso "Borrador restaurado".
- **`canDeactivate` guard** (`unsavedGuard`): si el form está `dirty` y sin enviar, confirma la salida.
- **Enviar:** diálogo de confirmación ("Esto es definitivo y cierra tu evaluación"). En éxito: limpia el borrador, toast OK, navega a la cola. Botón con estado `submitting` (deshabilitado mientras envía).
- **Mapeo a `EvaluacionRequest`:** BOOLEANO→escalaMin/escalaMax, SELECCION→número del mapeo lineal, resto directo.

---

## Manejo de errores

- **Carga de cola/asignación:** `error.interceptor` centraliza; cada página muestra error con retry. 404 en `/evaluaciones/:id` (inexistente o de otro evaluador) → "No encontramos esta asignación" + volver a la cola.
- **Snapshot corrupto:** si `parseSnapshot` devuelve `null`, `EvaluarPage` muestra error claro y no arma el form.
- **Documento no disponible:** `documento-viewer` cae a enlace de descarga.
- **Envío fallido:** toast con el mensaje; el form **no** se limpia ni se borra el borrador (no se pierde lo escrito). 409/422 (asignación ya completada o vencida) → mensaje específico + sugerir volver a la cola. Sin reintento automático.

---

## Testing (Vitest)

- `evaluacion-form.builder.spec.ts` — **el más importante:** form desde snapshots de cada tipo; rangos min/max, required, opciones de SELECCION; TEXTO no aporta al promedio; mapeo BOOLEANO→0/máx y SELECCION→escala.
- `evaluaciones.service.spec.ts` — URLs/params correctos (`HttpTestingController`); `parseSnapshot` con JSON válido e inválido.
- `evaluacion-draft.store.spec.ts` — guardar/restaurar/limpiar; aislamiento por `asignacionId`.
- `criterio-field.spec.ts` — render por `tipo`; read-only deshabilita inputs; toggle de comentario privado.
- `cola-page.spec.ts` — tabs cambian el fetch; badge de vencida; estados loading/empty/error.
- `evaluar-page.spec.ts` — modo editable vs read-only vs cancelada; preview de nota ponderada; submit arma el `EvaluacionRequest` correcto y limpia el borrador en éxito.

---

## Decisiones tomadas (con su porqué)

1. **Field polimórfico (opción A)** sobre un componente por tipo: 5 tipos simples comparten el mismo boilerplate; un `@switch` evita repetición y concentra el dominio en `criterio-field` + `evaluacion-form.builder`, ambos testeables aislados.
2. **PDF embebido directo** (no blob): la auth es por cookie (`withCredentials`), así que un `<object>` a la URL del documento carga sin manejo manual del token.
3. **Borrador local + confirmación**: el `POST` es irreversible y no hay endpoint de borrador en el backend; `localStorage` evita perder trabajo y el diálogo evita envíos accidentales.
4. **Preview de nota client-side**: ayuda al evaluador a entender el efecto de sus puntajes; no es fuente de verdad (el backend recalcula y decide).

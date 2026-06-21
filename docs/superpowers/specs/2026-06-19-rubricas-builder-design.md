# Rúbricas — Builder y gestión (Spec 1)

**Fecha:** 2026-06-19
**Estado:** aprobado
**Alcance:** componente de creación/gestión de rúbricas de evaluación (frontend `academconnect-web` + cambios de backend `academconnect`).

## Contexto y propósito

Hoy las rúbricas (`template_evaluacion`) solo las puede crear/editar el `ADMINISTRADOR`, atadas a un `scope` (INSTITUCIONAL / POR_TIPO_TRABAJO / POR_TRABAJO) y a un `tipo_trabajo_aplicable`. No hay UI: el frontend solo consume el snapshot inmutable que la asignación congela.

El objetivo es que **profesores y evaluadores construyan y compartan sus propias rúbricas**: rúbricas **generales** (no atadas a un tipo de trabajo), con visibilidad **pública/privada**, que otros puedan reutilizar. Esta spec cubre el **builder y la gestión**; el flujo de seleccionar/usar-por-defecto/crear una rúbrica al asignar una evaluación es una **feature aparte (Spec 2)**.

### Fuera de alcance (Spec 2)
- Pre-menú de selección de rúbrica al asignar una evaluación.
- Creación de asignaciones por profesor / cambios en `POST /api/asignaciones`.
- "Usar rúbrica por defecto" y "crear en runtime" durante la asignación.

## Decisiones de diseño (resueltas en brainstorming)

1. **Rúbricas generales**, sin vínculo a `tipo_trabajo`.
2. **Visibilidad `PUBLICO | PRIVADO`** reemplaza al `scope` actual. Default `PRIVADO`.
3. **Propiedad por autor**: el creador es dueño. Otros pueden ver/usar las públicas pero no editarlas.
4. **Roles**: crean `PROFESOR`, `EXTERNO` (evaluadores) y `ADMINISTRADOR`. El **admin puede todo** (crear y moderar/editar/borrar cualquier rúbrica), aunque su uso principal es moderación, no autoría.
5. **Escala única por rúbrica** (default 0–10, configurable): el builder fija el mismo `escalaMin/escalaMax` en todos los criterios. El umbral debe caer dentro de esa escala.
6. **Pesos en % manuales** que deben sumar 100% (= 1.0), con total en vivo y acción "distribuir equitativamente". `TEXTO` no pondera (peso 0). Sin auto-normalización.
7. **Layout del builder**: dos paneles — izquierda el formulario/editor de criterios, derecha una **vista previa en vivo** de la rúbrica renderizada como la verá el evaluador (reusa la estética de `criterio-field` + anillo de proyección).

### Garantía de inmutabilidad
Editar, despublicar o desactivar una rúbrica **nunca** afecta evaluaciones ya realizadas: cada asignación congela un snapshot inmutable del template al momento de asignar. Editar solo impacta asignaciones futuras.

## Modelo de datos (backend `template_evaluacion`)

Migración aditiva (no hay templates sembrados):

```sql
ALTER TABLE template_evaluacion ADD COLUMN visibilidad VARCHAR(20) NOT NULL DEFAULT 'PRIVADO';
ALTER TABLE template_evaluacion ADD COLUMN autor_id BIGINT REFERENCES usuario(id);
ALTER TABLE template_evaluacion ALTER COLUMN scope DROP NOT NULL;
-- check de visibilidad
ALTER TABLE template_evaluacion ADD CONSTRAINT chk_template_visibilidad
  CHECK (visibilidad IN ('PUBLICO','PRIVADO'));
```

- `scope` y `tipo_trabajo_aplicable` quedan **deprecados** (nullable, no se exponen ni se requieren en la UX).
- `criterios` (jsonb), `umbral_aprobacion`, `activo` **sin cambios**.

**Dominio:** nuevo enum `Visibilidad { PUBLICO, PRIVADO }`; campos `visibilidad` y `autor` (`@ManyToOne` a `Usuario`, nullable para datos viejos).

### Contrato de criterios (sin cambios, lo valida el backend)
Cada criterio jsonb: `{codigo, nombre, tipo, peso, escalaMin, escalaMax, opciones?}`.
- `tipo ∈ {ESCALA, SLIDER, SELECCION, BOOLEANO, TEXTO}`.
- `SELECCION` → `opciones` no vacío.
- `TEXTO` → `peso = 0`. Resto (incl. `BOOLEANO`) → `0 < peso ≤ 1`, `escalaMin < escalaMax`.
- Suma de pesos ponderables = `1.0` (±0.001).
- `umbralAprobacion` dentro de `[min, max]` agregado de los criterios ponderables.

## Backend — DTOs y autorización

**`TemplateEvaluacionRequest`**: quitar `scope` (NotNull) y `tipoTrabajoAplicable`; agregar `visibilidad` (`@NotNull`). Mantener `nombre`, `descripcion`, `criterios`, `activo`, `umbralAprobacion`.

**`TemplateEvaluacionResponse`**: agregar `visibilidad`, `autorId`, `autorNombre`; quitar `scope`/`tipoTrabajoAplicable` de la exposición.

**`TemplateEvaluacionController`** (cambios de `@PreAuthorize` y resolución de autor):
- `POST /api/templates` → `hasAnyRole('PROFESOR','EXTERNO','ADMINISTRADOR')`. El servicio fija `autor = usuario autenticado` y `visibilidad` (default `PRIVADO` si no viene).
- `PUT /api/templates/{id}` → autenticado; el servicio valida **dueño o admin**.
- `DELETE /api/templates/{id}` → autenticado; **dueño o admin** (desactiva, soft).
- `GET /api/templates` → devuelve **propias (cualquier visibilidad) + públicas de otros** (filtrado por el usuario autenticado). Admin ve todas.
- `GET /api/templates/{id}` → propia, pública, o admin; si no, 403/404.
- (Opcional, Spec 2) `PATCH /{id}/visibilidad` para publicar/despublicar; en Spec 1 alcanza con que `PUT` permita cambiar `visibilidad`.

Los métodos de escritura reciben `Authentication`/`Jwt` y resuelven el usuario por email (patrón ya usado en otros controllers). Errores de autorización → 403; inexistente → 404.

## Frontend (`academconnect-web`)

Nueva feature lazy `features/rubricas`, en el sidebar para `PROFESOR`/`EXTERNO`/`ADMINISTRADOR`.

### Rutas
- `/rubricas` — listado.
- `/rubricas/nueva` — builder (crear).
- `/rubricas/:id/editar` — builder (editar; solo dueño/admin).
- `roleGuard` data `roles: ['PROFESOR','EXTERNO','ADMINISTRADOR']`. Guard `unsaved` (canDeactivate) en el builder, reusando el patrón de `evaluar-page`.

### Modelos y servicio
- `rubricas.models.ts`: `Visibilidad`, `Rubrica` (id, nombre, descripcion, visibilidad, autorId, autorNombre, escalaMin, escalaMax, umbralAprobacion, criterios: `Criterio[]`, activo, fechas). Reusa el tipo `Criterio`/`CriterioTipo` de `evaluaciones`.
- `rubricas.service.ts` (`providedIn: 'root'`): `listar()` (propias + públicas), `obtener(id)`, `crear(req)`, `actualizar(id, req)`, `desactivar(id)`. Serializa/parsea `criterios` (string jsonb ↔ `Criterio[]`).

### Página de listado (`/rubricas`)
- Dos secciones/tabs: **Mías** y **Públicas** (de la comunidad).
- Cards con: nombre, autor, badge de visibilidad, nº de criterios, umbral, estado activa/inactiva.
- Acciones sobre las propias: **Editar**, **Publicar/Despublicar**, **Desactivar**. Sobre públicas de otros: **Ver** (readonly). (Duplicar queda para Spec 2.)
- Contenedor con el margen validado del proyecto (patrón `cola-page`/`evaluar-page`).

### Builder (`/rubricas/nueva` · `/rubricas/:id/editar`) — dos paneles
**Panel izquierdo (formulario reactivo tipado):**
- Datos: `nombre` (requerido), `descripcion`, toggle **Privada/Pública**.
- Escala única: `escalaMin`/`escalaMax` (default 0/10); `umbralAprobacion` (validado dentro de la escala).
- **Editor de criterios** (`FormArray`): agregar/quitar/reordenar (botones subir/bajar). Por criterio: `nombre`, `tipo` (select), `peso %` (oculto/0 para TEXTO), y para `SELECCION` la lista de `opciones`. `codigo` autogenerado como slug del nombre (único en la rúbrica).
- **Total de pesos en vivo** con estado ✓/✗ y botón **"Distribuir equitativamente"**. Validación espejo del backend (no permite guardar si pesos ≠ 100%, SELECCION sin opciones, umbral fuera de rango).

**Panel derecho (vista previa en vivo):**
- Renderiza la rúbrica como la verá el evaluador, **reutilizando `criterio-field`** (controles tipados segmentados/slider/pills, no interactivos) y el **anillo de proyección** de `evaluar-page`, alimentados por los criterios actuales del formulario. Se actualiza a medida que se edita.

### Lógica pura reutilizable (`rubricas/rubrica-builder.builder.ts`)
Funciones puras testeables: construir el `FormGroup` de criterio/rúbrica, `slugify(nombre)`, `sumaPesos`, `distribuirEquitativamente`, `validarRubrica` (espejo del backend), y `toTemplateRequest` (form → request con `criterios` serializado y escala uniforme aplicada a todos los criterios).

## Manejo de errores
- Backend: violaciones de validación → `BusinessException` (4xx) con mensaje; autorización → 403; inexistente → 404.
- Frontend: validación en vivo bloquea el submit; errores del servidor (409/422) se muestran sin perder el formulario; borrador local opcional no es necesario (formulario corto), pero el `unsavedGuard` evita perder cambios al navegar.

## Testing
- **Backend**: tests de servicio para autorización (dueño/admin/ajeno), filtrado del listado (propias + públicas), y validación de criterios con los nuevos campos. Test de controller para los nuevos roles en `POST`.
- **Frontend**: unit tests de las funciones puras (`slugify`, `sumaPesos`, `distribuirEquitativamente`, `validarRubrica`, `toTemplateRequest`); tests de componente del builder (agregar criterio, total de pesos, bloqueo de guardado inválido, preview se actualiza) y del listado (tabs, acciones según propiedad); test del servicio con `HttpTestingController`.
- Vitest vía `@angular/build:unit-test`.

## Componentes reutilizados
- `criterio-field` (de `evaluaciones`) para la vista previa.
- Anillo de proyección y utilidades de `evaluacion-form.builder` donde apliquen.
- Patrón de contenedor/margen, `roleGuard`, `unsavedGuard`, tokens de diseño existentes.

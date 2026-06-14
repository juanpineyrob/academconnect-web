# Spec D1 — Versionamiento de trabajos (Backend): reemplazo y eliminación con soft-delete

**Fecha:** 2026-06-14
**Items del backlog:** #8 (Gestión de entregas, parte backend)
**Repositorio:** `../academconnect` (Spring Boot / Java)
**Alcance:** Migration + entidad + DTO + 2 endpoints + cap soft de 10 activas + auth. Sin cambios de UI (eso es D2).

## Contexto

El usuario pidió un mecanismo de "entregas" con cargar / reemplazar / eliminar y audit completo (createdAt, updatedAt, deletedAt, usuario). El backend ya tiene `Versionamiento` (1:N por trabajo) con `documento` y `numero_version`, expuesto en `/api/trabajos/{id}/versiones` con GET y POST (multipart). Faltan:

- PUT (reemplazar) y DELETE (eliminar).
- Soft-delete + audit completo en DTO (hoy sólo se expone `createdAt`).
- Cap de máximo 10 entregas activas por trabajo.
- Filtrado por defecto de soft-deleted en listado.

**Decisión de naming:** se mantiene "Versión / Versionamiento" en backend Y frontend. Los specs subsiguientes y la UI usarán los mismos términos del modelo (no se traduce a "Entrega" para evitar drift).

## Por qué soft-delete

- El sistema no maneja deadlines hoy. Si más adelante se agregan, va a ser clave poder verificar cuándo se subieron / modificaron / eliminaron entregas. Soft-delete preserva el timestamp histórico.
- Audit académico: borrado físico de evidencia es un riesgo regulatorio.
- Costo: una migration de 2 columnas + un índice parcial. Bajo.

**Lo que NO incluye:** un campo `reemplaza_a_id` que linkee old↔new. Se descartó por YAGNI — la correlación temporal vía `createdAt`/`deletedAt` por trabajo es suficiente para audit. Se puede agregar más adelante si surge una necesidad concreta.

## Migration

Archivo: `src/main/resources/db/migration/V11__versionamiento_soft_delete.sql`

```sql
ALTER TABLE versionamiento
  ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN deleted_by VARCHAR(100);

CREATE INDEX idx_versionamiento_trabajo_activas
  ON versionamiento(trabajo_id)
  WHERE deleted_at IS NULL;
```

Constraint `uq_versionamiento_trabajo_numero` se mantiene: todas las versiones (activas y soft-deleted) conservan `numero_version` único por trabajo. Eso asegura que un reemplazo nunca colisione.

## Cambios en entidad

`com.academconnect.domain.Versionamiento`:

```java
@Column(name = "deleted_at")
private Instant deletedAt;

@Column(name = "deleted_by", length = 100)
private String deletedBy;
```

Helper sugerido en la entidad: `isActiva()` retorna `deletedAt == null`.

## DTO expandido

`com.academconnect.dto.VersionamientoResponse`:

```java
public record VersionamientoResponse(
    Long id,
    Long trabajoId,
    int numeroVersion,
    String comentario,
    DocumentoResponse documento,
    Instant createdAt,
    String createdBy,
    Instant updatedAt,
    String updatedBy,
    Instant deletedAt,
    String deletedBy
) {}
```

Mapper actualizado en consecuencia.

## Endpoints nuevos

### PUT /api/trabajos/{trabajoId}/versiones/{id}

**Consumes:** `multipart/form-data` (`file` + `comentario` opcional, idéntico al POST).

**Semántica:**

1. Carga versión activa por `id`. Si está soft-deleted o no existe → 404.
2. Verifica que el caller es el estudiante dueño del trabajo (sino 403).
3. Verifica cap: si `countByTrabajoIdAndDeletedAtIsNull(trabajoId) >= 10` y el reemplazo lleva +1, rechaza con 400 + mensaje "Máximo 10 entregas activas por trabajo". (Edge case: como se va a soft-delete la old y crear new, el delta neto es 0, así que la verificación es `>= 11`. Ver impl.)
4. Marca la vieja: `deletedAt = now()`, `deletedBy = currentUser`.
5. Crea un nuevo `Versionamiento` (`numero_version = max+1`, `comentario`, `documento` deduplicado por sha256).
6. Publica `ActividadEvent` tipo `VERSION_REEMPLAZADA` con `{trabajoId, oldVersionId, newVersionId, numeroVersion}`.
7. Devuelve `VersionamientoResponse` del nuevo.

**Auth:** `@PreAuthorize("hasRole('ESTUDIANTE')")` + validación dueño en el service.

### DELETE /api/trabajos/{trabajoId}/versiones/{id}

**Semántica:**

1. Carga versión activa por `id`. Soft-deleted o no existente → 404.
2. Verifica dueño (sino 403).
3. `deletedAt = now()`, `deletedBy = currentUser`. Save.
4. Publica `ActividadEvent` tipo `VERSION_ELIMINADA` con `{trabajoId, versionId, numeroVersion}`.
5. Devuelve 204 No Content.

**Auth:** `@PreAuthorize("hasRole('ESTUDIANTE')")` + validación dueño.

## Listado: filtrado por defecto

`GET /api/trabajos/{trabajoId}/versiones` actualmente retorna todo. Cambio:

- Por defecto, retorna sólo activas (`deletedAt IS NULL`).
- Query param opcional `includeDeleted=true` para incluir histórico (uso: admin, audit, futura UI de versiones completas).

Repository:
```java
List<Versionamiento> findByTrabajoIdAndDeletedAtIsNullOrderByNumeroVersionDesc(Long trabajoId);
List<Versionamiento> findByTrabajoIdOrderByNumeroVersionDesc(Long trabajoId); // ya existe
long countByTrabajoIdAndDeletedAtIsNull(Long trabajoId);
```

Service:
```java
public List<VersionamientoResponse> listarPorTrabajo(Long trabajoId, boolean includeDeleted) { ... }
```

## Cap de 10 entregas activas

Aplica en POST `crear()` y en PUT `reemplazar()`:

- POST: si `countActivas(trabajoId) >= 10` → BusinessException("Máximo 10 entregas activas por trabajo").
- PUT: el delta neto es 0 (1 soft-delete + 1 create), entonces sólo aplica si ya estaba en 10 y se quiere subir adicional. Como el flow PUT marca old como deleted antes de crear new, el chequeo en PUT es: si la vieja YA está deleted → 404. La cuenta activas en el momento del PUT es 10 (incluyendo la que vamos a deletear), entonces el chequeo es `if (activas > 10) throw...`. Strict-equality: el flow es válido mientras `activas == 10`.

Decisión: la constante `MAX_ACTIVAS = 10` vive en el service como `private static final`. Si más adelante se quiere configurable per-tipo-de-trabajo, se mueve a `TipoTrabajoConfig`.

## TipoActividad — nuevos valores

```java
VERSION_REEMPLAZADA,
VERSION_ELIMINADA
```

`VERSION_SUBIDA` ya existe y se mantiene para POST.

## Storage de documentos

**Sin cambios.** Las versiones soft-deleted siguen referenciando su `documento_id`. El archivo físico NO se borra: queda accesible para audit (admin, juicios, etc.). Si en el futuro se quiere garbage-collection de archivos huérfanos (ningún versionamiento activo los referencia), se puede agregar un job aparte.

## Tests

`VersionamientoServiceTest`:

- `crear` con `activas == 10` falla con BusinessException.
- `reemplazar` marca old como deleted, crea new con `numero_version = max+1`.
- `reemplazar` con caller ajeno → 403.
- `reemplazar` sobre version ya deleted → 404.
- `eliminar` marca como deleted; segundo `eliminar` → 404.
- `listarPorTrabajo(trabajoId, false)` excluye deleted; con `true` los incluye.
- `crear` con cap == 10 y luego `reemplazar`: válido (delta 0).

`VersionamientoControllerTest`:

- `PUT` sin auth → 401; con estudiante ajeno → 403.
- `DELETE` correctos paths.
- `GET ?includeDeleted=true` requiere autenticación (sin role-check extra por ahora).

## Criterios de aceptación

1. Migration V11 corre limpia en una BD con datos previos (las versiones existentes quedan con `deleted_at = NULL`).
2. `POST` rechaza con 400 cuando hay 10 activas; mensaje "Máximo 10 entregas activas por trabajo".
3. `PUT` reemplaza correctamente: la respuesta tiene `numero_version` mayor; un `GET` muestra solo la nueva por defecto; con `includeDeleted=true` aparecen ambas.
4. `DELETE` soft-deletea; `GET` por defecto no la incluye; cuenta de activas decrementa.
5. `VersionamientoResponse` expone los 6 campos de audit. El frontend (D2) puede mostrar la información sin nuevos endpoints.
6. Test suite verde.

## Fuera de alcance (D1)

- UI frontend (D2).
- Soft delete de `Documento` (queda; archivos huérfanos posibles, se manejan separately).
- Fechas límite / hitos por entrega (mencionado por el user como complejidad mayor; no se incluye).
- Permitir profesor orientador modificar versiones (sólo dueño estudiante).
- Job de garbage collection de archivos huérfanos.

## Riesgos / consideraciones

- **Cambio de comportamiento del GET existente:** hoy retorna soft-deleted (no había). En la práctica nadie está soft-deleting hoy, entonces el cambio es backward-compatible para clientes vivos. Documentar el nuevo param `includeDeleted` en el changelog.
- **Concurrencia en cap:** dos POSTs paralelos podrían pasar el chequeo simultáneamente y dejar 11 activas. Se acepta el riesgo de race; si surge en producción, agregar un advisory lock o `SELECT FOR UPDATE`. Para una app de uso académico no es un problema esperable.
- **`Documento` deduplicado por sha256:** si el alumno sube el mismo archivo dos veces, sólo se crea un registro `documento`. Las versiones distintas apuntan al mismo documento. Esto ya pasa hoy y se mantiene.

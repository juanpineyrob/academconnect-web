# Diseño — Acceso anónimo a repositorio/perfiles y enlaces a redes sociales

**Fecha:** 2026-06-26
**Repos:** frontend `academconnect-web` (Angular 21) · backend `academconnect` (Spring Boot 3)

## Objetivo

Permitir que un **usuario no autenticado** use AcademConnect como canal de comunicación
institucional:

1. Navegue el **repositorio** público (lista + filtros + detalle de un trabajo, incluida
   la descarga del PDF) sin ser expulsado al login.
2. Entre directamente por URL al **perfil público** de un alumno o profesor (`/usuarios/:id`).
3. Vea en ese perfil **enlaces a redes** (GitHub, LinkedIn, ORCID, sitio web personal) que el
   dueño del perfil habilita desde "Editar perfil". Los iconos se muestran dinámicamente: solo
   aparecen los enlaces cargados.

Son dos hilos independientes alineados al mismo objetivo, organizados en dos fases. La Fase A
entrega valor por sí sola (el sistema deja de expulsar al anónimo); la Fase B agrega las redes.

## Estado actual (verificado)

- **Routing FE:** el `authGuard` ya **no** está en la ruta padre. `/repositorio`,
  `/repositorio/:id` y `/usuarios/:id` no tienen guard. El resto de features aplican
  `authGuard` por feature.
- **Perfil público:** `PerfilPublicoPage` y la ruta pública `/usuarios/:id` ya existen.
  La `trabajo-card` ya linkea autor y orientador a `/usuarios/:id`.
- **Backend `SecurityConfig`** ya expone (GET, permitAll): `/api/trabajos/buscar`,
  `/api/trabajos/*/archivo`, `/api/usuarios/*/perfil`, `/api/usuarios/*/reconocimientos`,
  y `POST /auth/**`.
- **Bloqueo real del acceso anónimo:** el `errorInterceptor`
  (`src/app/core/http/error.interceptor.ts`) ante **cualquier** 401 (salvo `/auth/login`)
  hace `auth.clearSession()` + `router.navigate(['/login'])`. El probe de bootstrap
  `GET /me/perfil` (`AuthService.bootstrap()`, vía `provideAppInitializer`) devuelve 401 para
  el anónimo y lo expulsa al login. El `Sidebar`/`Header` asumen usuario logueado.
- **Redes sociales:** no existe nada (ni columnas, ni DTO, ni UI). El modelo `Usuario` no
  tiene `github/linkedin/orcid/sitioWeb`.
- **Endpoints que toca el repositorio y aún NO son públicos:** `GET /api/areas-tematicas`
  (filtros, `repositorio.service.ts:42`) y `GET /api/trabajos/{id}` (detalle,
  `repositorio.service.ts:38`).

## Decisiones

- **Modelo de redes:** campos fijos ampliables → `githubUrl`, `linkedinUrl`, `orcidUrl`,
  `sitioWebUrl`.
- **Fix del 401:** el `errorInterceptor` redirige a `/login` **solo si
  `auth.currentUser() != null`** al momento del 401 (sesión expirada). Anónimo: deja pasar el
  error sin redirect ni `clearSession`.
- **Alcance anónimo del repositorio:** incluye el **detalle** `/repositorio/:id` y la descarga
  del PDF.
- **Redes por rol:** solo **ESTUDIANTE** y **PROFESOR**. EXTERNO no edita ni muestra redes.

---

## Fase A — Desbloquear acceso anónimo

### A1. `errorInterceptor` (frontend)

Archivo: `src/app/core/http/error.interceptor.ts`.

Cambiar la condición de redirect: solo redirigir cuando había sesión activa.

```ts
const teniaSesion = auth.currentUser() !== null;
if (err.status === 401 && !isLogin && teniaSesion) {
  auth.clearSession();
  void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
}
```

Para el anónimo (`currentUser() === null`) el 401 se propaga al caller sin efectos colaterales.
Esto cubre el probe de bootstrap y cualquier llamada de página pública que devuelva 401.

### A2. Shell tolerante a usuario anónimo (frontend)

- `Header` (`src/app/layout/header/header.*`): ya tiene `@if (user(); as u)` con fallback
  "Ingresar". Verificar que sin usuario no se rompan `Avatar`/`FeedDropdown` (no renderizar el
  dropdown de feed cuando `user()` es null).
- `Sidebar` (`src/app/layout/sidebar/sidebar.*`): cuando `currentUser()` es null, ocultar el
  sidebar o reducirlo a un único acceso "Repositorio". No debe mostrar secciones por rol.

### A3. Backend — whitelist y guard del detalle (`academconnect`)

Archivo: `src/main/java/com/academconnect/config/SecurityConfig.java`.

Agregar al bloque GET `permitAll`:

```java
"/api/areas-tematicas",
"/api/trabajos/{id}"
```

(Usar el patrón de matcher que ya emplea el archivo, p. ej. `/api/trabajos/*`.)

`GET /api/trabajos/{id}` (`TrabajoController.java:86`): para un caller **anónimo**, devolver
**404** si el trabajo no está `APROBADO`, de modo que el detalle público no filtre trabajos
privados. Un caller autenticado mantiene el comportamiento actual. La descarga
`/api/trabajos/*/archivo` ya es pública.

### A4. Verificación Fase A

- Anónimo abre `/repositorio` por URL → carga, no redirige a login.
- Filtra por área (los chips de área cargan).
- Entra a un trabajo APROBADO `/repositorio/:id` → ve detalle y puede descargar el PDF.
- Intenta `/repositorio/:id` de un trabajo no aprobado → 404 / "no encontrado".
- `/perfil`, `/hub`, etc. siguen redirigiendo a login (guard por feature intacto).

---

## Fase B — Enlaces a redes sociales

### B1. Backend (`academconnect`)

- **Entidad `Usuario`:** 4 columnas nullable `githubUrl`, `linkedinUrl`, `orcidUrl`,
  `sitioWebUrl` (VARCHAR). En la base `Usuario` (no en subclases), porque aplican a ESTUDIANTE
  y PROFESOR.
- **Migración Flyway:** un archivo nuevo `V__add_redes_sociales_usuario.sql` (siguiente número
  de versión libre) que agrega las 4 columnas. Flyway corre con `validate`, así que es una
  migración por la entidad afectada.
- **DTOs:** incluir los 4 campos en `PerfilResponse` (`/me/perfil`) y en
  `PerfilPublicoResponse` (`/api/usuarios/{id}/perfil`). Aceptarlos en el request de
  actualización de perfil (`PerfilUpdateRequest` o equivalente) y persistirlos en
  `PerfilService`.
- **Validación:** cada campo, si viene no vacío, debe ser una URL `http(s)` válida
  (`@URL`/`@Pattern` o validación en el service). Para `github`/`linkedin`/`orcid` se acepta
  cualquier URL válida (no se fuerza el host, para no bloquear casos legítimos). EXTERNO: el
  service ignora estos campos (quedan null).

### B2. Frontend — modelos y servicio

Archivo: `src/app/features/perfil/perfil.models.ts`.

Agregar a `Perfil`, `PerfilPublico` y `PerfilUpdateRequest`:

```ts
githubUrl: string | null;
linkedinUrl: string | null;
orcidUrl: string | null;
sitioWebUrl: string | null;
```

(En `PerfilUpdateRequest` como opcionales `?`.) `perfil.service.ts` no necesita métodos nuevos:
el update de perfil ya existe; solo viaja con los campos extra.

### B3. Edición — "Enlaces y redes"

Archivo: `src/app/features/perfil/components/editar-perfil-form/editar-perfil-form.*`.

- Nueva sección colapsable/agrupada "Enlaces y redes" con 4 inputs URL **opcionales**
  (Reactive form). Validador de patrón URL `http(s)`; vacío permitido.
- La sección se muestra **solo si el rol es ESTUDIANTE o PROFESOR**. Para EXTERNO no se
  renderiza.
- Etiquetas e `inputmode="url"`; mensajes de error accesibles asociados con `aria-describedby`.

### B4. Render dinámico de iconos

Archivo: `src/app/features/perfil/components/perfil-header/perfil-header.*` (compartido por
`PerfilPropioPage` y `PerfilPublicoPage`).

- Una fila de enlaces que itera solo sobre los campos **no nulos/no vacíos**. Si no hay
  ninguno, la fila no se renderiza.
- Cada enlace: `<a [href]="url" target="_blank" rel="noopener noreferrer">` con icono de marca
  como **SVG inline** (los iconos de marca no usan `NgOptimizedImage` porque es contenido
  inline) y `aria-label` descriptivo (p. ej. "Perfil de GitHub de {nombre}"). Texto visible o
  `aria-label` para cumplir WCAG AA; foco visible y contraste de color adecuados (AXE).
- Iconos: GitHub, LinkedIn, ORCID y un icono genérico de "sitio web/enlace".

### B5. Verificación Fase B

- Alumno/profesor edita perfil, carga 1–4 enlaces, guarda → persisten.
- Perfil propio y `/usuarios/:id` muestran solo los iconos cargados, abren en nueva pestaña.
- EXTERNO no ve la sección de edición de redes.
- Anónimo en `/usuarios/:id` ve los iconos.
- AXE sobre `/usuarios/:id`: links con nombre accesible, foco visible, contraste OK.

---

## Componentes y límites

| Unidad | Qué hace | Depende de |
|---|---|---|
| `errorInterceptor` | Decide redirect a login solo si había sesión | `AuthService.currentUser` |
| `Sidebar`/`Header` | Render tolerante a `currentUser() === null` | `AuthService` |
| `SecurityConfig` | Whitelist GET anónimos + guard detalle | — |
| `Usuario` + migración | Persistir 4 URLs de redes | Flyway |
| `PerfilResponse`/`PerfilPublicoResponse` | Exponer redes en lectura | `Usuario` |
| `editar-perfil-form` | Editar redes (solo ESTUDIANTE/PROFESOR) | `PerfilUpdateRequest` |
| `perfil-header` | Render dinámico de iconos | modelo `Perfil`/`PerfilPublico` |

## Testing

- Runner FE: **Vitest browser**.
- Backend: tests del endpoint detalle (anónimo + trabajo no aprobado → 404; anónimo +
  aprobado → 200) y de persistencia de redes en el update de perfil.
- Verificación end-to-end manual + AXE en `/repositorio` y `/usuarios/:id`.

## Fuera de alcance

- Redes para rol EXTERNO.
- Lista genérica/extensible de enlaces (se eligió set fijo ampliable).
- Nuevas entradas de navegación al perfil (la `trabajo-card` ya linkea autor/orientador).
- Validación estricta de host por plataforma (solo se valida URL `http(s)`).

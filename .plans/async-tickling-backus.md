# Plan — Frontend Angular: Autenticación + Perfil Académico

## Contexto

Es la **primera entrega del frontend** de AcademConnect (TCC). El backend Spring Boot está listo y cierra los 24 gaps frente al prototipo (`.plans/gaps-backend-prototipo.md`, `.plans/implementacion-cierre-gaps.md`). Hay que construir el frontend Angular en un **repositorio separado** (`/home/ignacio/Projects/academconnect-web`) que cubra:

1. **Autenticación**: pantalla 01 del prototipo (login institucional), bajo el esquema simplificado decidido en G01 (sin SSO/ORCID — solo email + password).
2. **Perfil académico**: pantallas 07 (estudiante) y 08 (evaluador) del prototipo, con las simplificaciones decididas en G04, G05, G10, G21, G22.

Resultado esperado: un usuario puede loguearse, ser redirigido al perfil correcto según su rol, ver/editar su perfil propio, y ver el perfil público de otro usuario. Sirve de base para el resto del frontend (dashboards, repositorio, evaluación).

### Decisiones de stack ya tomadas en esta sesión

- Repos separados: backend `academconnect` (este) + frontend `academconnect-web` (a crear).
- Angular CLI con **SCSS**, **sin SSR**, **routing habilitado**.
- **JWT solo en cookie httpOnly + SameSite=Strict** (más robusto frente a XSS). **No** se guarda el token en localStorage/sessionStorage en ningún momento. Detalle del modelo de sesión más abajo.
- Solo login en esta entrega (sin registro). "¿Primer ingreso? Solicitar cuenta" del prototipo queda como link inactivo.
- Solo español. Toggle ES/EN del prototipo se quita por ahora.
- Perfil con lectura + edición de datos básicos (bio, foto, datos personales, áreas de interés).

### Modelo de sesión (cómo persiste la autenticación)

**Fuente de verdad única: la cookie httpOnly `ac_jwt`.** JS no puede leerla — esa es la ganancia frente a XSS.

1. **Cookie**: emitida por backend en `/auth/login`. Atributos: `HttpOnly`, `Secure` (prod), `SameSite=Strict`, `Path=/`.
2. **Duración (mapea con el checkbox "Mantener sesión" del prototipo)**:
  - Checkbox **tildado** → backend emite cookie con `MaxAge = 14 días` (configurable vía property).
  - Checkbox **destildado** → backend emite **session cookie** (sin `MaxAge`) → muere al cerrar el browser.
  - El frontend pasa la preferencia como flag en el body del login (ej. `{email, password, remember: boolean}`); backend decide MaxAge.
3. **Bootstrap del SPA**: en `APP_INITIALIZER`, llamar `GET /me/perfil` con `withCredentials: true`. El browser adjunta la cookie sola.
  - 200 → reconstruir `currentUser$` (memoria) con la response. Entrar al destino.
  - 401 → no hay sesión válida. Redirigir a `/login`.
4. **Estado in-app**: `currentUser$: BehaviorSubject<{userId, nombre, email, rol} | null>` vive en memoria. Sobrevive toda navegación in-app sin tocar storage.
5. **Persistencia entre refresh / cierre de pestaña / cierre de browser**: la maneja **únicamente la cookie**. El SPA siempre re-pregunta a `/me/perfil` en cada cold start. No hay snapshot del perfil en localStorage/sessionStorage — el round-trip es barato (un solo GET liviano) y evita inconsistencias.
6. **Logout**: `POST /auth/logout` → backend devuelve `Set-Cookie: ac_jwt=; Max-Age=0`. Frontend limpia `currentUser$` y navega a `/login`.

**Lo que NO hacemos** (y por qué):
- No `localStorage.setItem('access_token', ...)` — anula el beneficio de XSS resistance.
- No `sessionStorage.setItem('access_token', ...)` — mismo problema, solo con vida más corta.
- No leer el `token` del body de `/auth/login` — está ahí por compatibilidad con tests pero el frontend lo ignora.
- No "remember me" emulado en JS — el browser ya hace eso con cookies persistentes.

---

## Contrato backend a consumir (relevante a esta entrega)

Mapeado por agente en backend (referencias: `controller/AuthController.java`, `controller/MeController.java`, `controller/ReconocimientoController.java`, `service/AuthService.java`, `dto/PerfilResponse.java`, `dto/PerfilUpdateRequest.java`, `config/SecurityConfig.java`).

**Auth**
- `POST /auth/login` → body `{email, password}` → response `{token, userId, nombre, email, rol}`. Tras Fase 0, el `token` se envía además vía cookie httpOnly y deja de ser necesario leerlo del body.
- `POST /auth/logout` (a crear en Fase 0) → 204 + `Set-Cookie` que invalida la cookie.

**Perfil**
- `GET /me/perfil` → `PerfilResponse` aplanado: `{id, email, nombre, rol, edad, ubicacion, biografia, fotoUrl, titulacion, cargo, institucion, titulo, areas: [{areaId, areaNombre, nivelExperticia}], trabajosPublicados: long, createdAt, updatedAt}`. Los campos por rol vienen poblados solo para el rol correspondiente.
- `PUT /me/perfil` → `PerfilUpdateRequest`: `{nombre, edad?, ubicacion?, biografia?, fotoUrl?, password?, titulacion?, cargo?, institucion?, titulo?}`.
- `GET /me/areas` → reusa `PerfilResponse` con `areas` poblado.
- `PUT /me/areas` → `UsuarioAreasRequest` con áreas + nivel.

**Reconocimientos (público)**
- `GET /api/usuarios/{usuarioId}/reconocimientos` → `[{id, tipo, descripcion, anio, otorgadoPorNombre, createdAt}]`. No requiere auth.

**Perfil público de otro usuario**
- Hoy **no existe** un `GET /api/usuarios/{id}/perfil` separado. Es un gap menor: en esta entrega el "perfil público" de pantalla 07/08 se renderiza solo para el usuario autenticado contra `/me/perfil`. Si el caso de ver-perfil-ajeno entra al alcance, se agrega `GET /api/usuarios/{id}/perfil` en una iteración posterior (no en este plan).

**Errores**
- `ProblemDetail` RFC 7807 con `type: urn:academconnect:error:*` (`bad-credentials`, `validation`, `business-rule`, `data-integrity`, `not-found`). El frontend mapea por `type` a mensajes amigables.

**Roles**
- `Rol`: `ESTUDIANTE | PROFESOR | EXTERNO | ADMINISTRADOR`. Determina a qué dashboard redirigir post-login (en esta entrega: `/perfil` para todos, pero la decisión queda parametrizada).

---

## Fase 0 — Prereq backend (cookie httpOnly)

Cambios mínimos al repo `academconnect`. Justifica el modelo de auth robusto.

**Archivos a tocar**
- `dto/LoginRequest.java` — agregar campo `boolean remember` (default `false`).
- `controller/AuthController.java` — agregar `HttpServletResponse` al endpoint `login()` y setear cookie usando `ResponseCookie`:
  ```
  long maxAge = req.remember() ? Duration.ofDays(14).toSeconds() : -1;  // -1 = session cookie
  ResponseCookie cookie = ResponseCookie.from("ac_jwt", token)
      .httpOnly(true)
      .secure(true)            // prod; en dev se controla con perfil
      .sameSite("Strict")
      .path("/")
      .maxAge(maxAge)
      .build();
  response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
  ```
  Mantener el `token` en el body por ahora para no romper tests existentes — frontend lo ignora.
- `controller/AuthController.java` — nuevo endpoint `POST /auth/logout` que devuelve 204 y un `Set-Cookie` con `Max-Age=0` para limpiar la cookie.
- `config/SecurityConfig.java` — habilitar `BearerTokenResolver` custom que primero intente leer de la cookie `ac_jwt` y caiga al header `Authorization: Bearer ...` (para no romper tests/integraciones existentes). Reusar la cadena JWT actual.
- `config/SecurityConfig.java` — agregar CORS permitiendo el origin del frontend (`http://localhost:4200`) con `allowCredentials=true`. Sin esto el browser descarta la cookie cross-origin.
- (Decisión documentada) CSRF: con `SameSite=Strict` el riesgo CSRF cross-site cae prácticamente a cero — el browser no envía la cookie en requests originadas en otro sitio. Para esta entrega no se agrega token CSRF; si en el futuro se relaja a `SameSite=Lax` (necesario si hay flujos de redirect externo), se introduce CSRF token entonces.

**Tests**
- Test de integración: login → la response trae `Set-Cookie: ac_jwt=...; HttpOnly; SameSite=Strict`.
- Test de integración: request a `/me/perfil` con cookie pero sin header `Authorization` → 200.
- Test de integración: logout → cookie con `Max-Age=0`.

Estimación: ~0.5 día.

---

## Fase 1 — Scaffold Angular (`academconnect-web`)

Repo nuevo en `/home/ignacio/Projects/academconnect-web`, hermano de este.

**Comandos** (los corre el usuario; ya estaba en el wizard de `ng new`):
```
cd /home/ignacio/Projects
ng new academconnect-web --routing --style=scss --ssr=false --strict
cd academconnect-web
git init && git add -A && git commit -m "chore: scaffold inicial"
```

**Estructura de carpetas final**
```
src/app/
├── core/                # singletons: servicios HTTP, interceptores, guards, models
│   ├── auth/
│   │   ├── auth.service.ts
│   │   ├── auth.interceptor.ts
│   │   ├── auth.guard.ts
│   │   ├── role.guard.ts
│   │   └── models.ts        # Rol, AuthResponse, LoginRequest
│   ├── http/
│   │   ├── problem-detail.ts        # ProblemDetail tipado
│   │   └── error.interceptor.ts     # mapea urn:academconnect:error:*
│   └── core.module.ts (si NgModule) o providers (si standalone)
├── shared/              # componentes UI reutilizables, pipes
│   ├── ui/
│   │   ├── button/
│   │   ├── input/
│   │   ├── card/
│   │   ├── badge/        # chips de rol, áreas
│   │   ├── avatar/
│   │   └── stat-card/
│   └── pipes/
├── layout/              # shell autenticado: sidebar, header, footer
│   ├── shell/
│   ├── sidebar/
│   └── header/
├── features/
│   ├── auth/
│   │   ├── login-page/
│   │   └── auth.routes.ts
│   └── perfil/
│       ├── perfil-propio-page/
│       ├── perfil-publico-page/    # placeholder, no se usa esta entrega
│       ├── components/
│       │   ├── perfil-header/
│       │   ├── perfil-stats/
│       │   ├── bio-academica/
│       │   ├── lineas-investigacion/
│       │   ├── reconocimientos/
│       │   ├── publicaciones-recientes/
│       │   └── editar-perfil-form/
│       └── perfil.routes.ts
└── styles/
    ├── _tokens.scss     # design tokens (colors, type, spacing, radii)
    ├── _typography.scss
    ├── _reset.scss
    └── main.scss        # entrypoint
```

**Configuración**
- `environments/environment.ts`: `apiBase: 'http://localhost:8080'`.
- `tsconfig.json`: paths `@app/*`, `@core/*`, `@shared/*`, `@features/*`.
- `angular.json`: `inlineStyleLanguage: 'scss'`, presupuestos de bundle subidos un poco para la primera entrega.
- ESLint + Prettier (default Angular ESLint).
- Decisión Angular moderna: **componentes standalone** (no NgModules) — es el default actual del CLI.

---

## Fase 2 — Design system / tokens SCSS

Basado en el prototipo (editorial-institucional). Mirar pantallas 02–08 para confirmar.

**`styles/_tokens.scss`** — exposición como CSS variables + maps SCSS:
- **Color**:
  - `--c-bg`, `--c-surface`, `--c-surface-elevated`.
  - `--c-text`, `--c-text-muted`, `--c-text-faint`.
  - `--c-primary` (navy `#0A1F44` aprox, ver muestra del PDF), `--c-primary-contrast`.
  - `--c-accent` (azul royal `#3056F5`).
  - Estados de chip: `--c-state-aprobado` (verde), `--c-state-revision` (amarillo), `--c-state-rechazado` (rojo), `--c-state-borrador` (gris), `--c-state-enviado` (azul claro), `--c-state-observado` (ámbar).
  - Modo oscuro: queda preparado vía `prefers-color-scheme` pero no se implementa en esta entrega (el toggle de sol/luna del prototipo queda inactivo).
- **Typography**:
  - Serif para titulares: variable que apunte a una serif con itálica disponible vía Google Fonts (candidatos: **Source Serif 4**, **Newsreader**, **Cormorant Garamond**). Elegir una al implementar.
  - Sans para UI/body: **Inter** (estándar editorial).
  - Escalas: `--fs-display`, `--fs-h1` … `--fs-body`, `--fs-caption`. Peso variable.
- **Espaciado**: escala 4px (`--sp-0` … `--sp-8`).
- **Radii**: `--r-sm 6px`, `--r-md 10px`, `--r-lg 14px`.
- **Sombras**: `--sh-card`, `--sh-elevated`.

**`styles/_typography.scss`** — utilidades `.t-display`, `.t-h1`, `.t-body`, etc.

**`styles/main.scss`** — importa tokens, typography, reset; configura `body { font-family, color, background }`.

**Componentes UI base** (`shared/ui/`):
- `<ac-button variant="primary|ghost|link" size="sm|md">`
- `<ac-input>` con label flotante y soporte de error visual
- `<ac-card>` (contenedor con sombra suave + radio + padding)
- `<ac-badge variant="state|role|area">` (chips: estados, rol, áreas temáticas)
- `<ac-avatar>` con iniciales o `fotoUrl`
- `<ac-stat-card>` (KPI con label en mayúsculas + número grande tipográfico + sublínea)

---

## Fase 3 — Core de autenticación

**`core/auth/models.ts`**
```typescript
export type Rol = 'ESTUDIANTE' | 'PROFESOR' | 'EXTERNO' | 'ADMINISTRADOR';
export interface LoginRequest { email: string; password: string; }
export interface AuthResponse { token: string; userId: number; nombre: string; email: string; rol: Rol; }
```

**`core/auth/auth.service.ts`**
- `login({email, password, remember}): Observable<AuthResponse>` — `POST /auth/login` con `withCredentials: true`. Backend setea la cookie con `MaxAge` según `remember`.
- `logout(): Observable<void>` — `POST /auth/logout` con `withCredentials`. Limpia `currentUser$` y navega a `/login`.
- `currentUser$` — `BehaviorSubject<{userId, nombre, email, rol} | null>` en **memoria**. Es la única representación in-app del usuario logueado. **No** se persiste el JWT en ningún storage de JS.
- `bootstrap()` (vía `APP_INITIALIZER`) — siempre llama `GET /me/perfil` con `withCredentials`. Si 200, popula `currentUser$` desde la response. Si 401, deja `currentUser$ = null` (el `auth.guard` redirige a `/login` cuando alguien intente entrar a una ruta protegida).

**`core/auth/auth.interceptor.ts`**
- Setea `withCredentials: true` en toda request al `apiBase` para que el browser mande la cookie.
- No agrega `Authorization` (no tenemos token en JS).

**`core/http/error.interceptor.ts`**
- Captura `HttpErrorResponse`, parsea el body como `ProblemDetail`, mapea por `type` a un mensaje display.
- En 401, dispara `authService.logout()` local y redirige a `/login`.
- Expone errores vía un servicio simple (`ToastService`) o las devuelve al caller para que el form los muestre inline.

**`core/auth/auth.guard.ts`** — `CanActivateFn` que verifica `authService.currentUser$`; si null, redirige a `/login` con `returnUrl` en queryParams.

**`core/auth/role.guard.ts`** — toma `data: { roles: Rol[] }` de la ruta y verifica `currentUser.rol`.

---

## Fase 4 — Login page (pantalla 01 simplificada)

Ruta: `/login`. Standalone component `LoginPageComponent`.

**Layout** — replicar el split-screen del prototipo:
- Izquierda: hero editorial con titular serif + itálica ("Centraliza la *evaluación científica* de tu institución."), copy, stats públicas pequeñas. Consumir `GET /public/stats` (existe en backend tras G02): `{trabajosPublicados, areasActivas, evaluadoresActivos}`. Si la llamada falla, mostrar placeholders sin romper la UI.
- Derecha: card de login con:
  - Pill "Acceso institucional seguro" arriba.
  - Heading "Inicia sesión".
  - **Sin botones SSO/ORCID** (G01).
  - Sin separador "o con correo institucional".
  - Form reactivo: email (validator `Validators.email`), password (`required`).
  - Checkbox "Mantener sesión en este dispositivo" — **funcional**. Si tildado, se manda `remember: true` al login y backend emite cookie con `MaxAge=14 días`. Si destildado, cookie de sesión (muere al cerrar el browser).
  - Botón "Acceder al panel →" (`<ac-button variant="primary">`).
  - Link inactivo "¿Primer ingreso? Solicitar cuenta" (mailto o `#` con tooltip "Contacta a tu administrador institucional").
  - Footer del card: "v3.2" se quita (era ORCID compatible — G21).

**Flujo**
1. Submit → `AuthService.login({email, password, remember})`. Browser persiste la cookie httpOnly que devuelve el backend.
2. On success → `currentUser$.next(res)`, redirige a `returnUrl` (de queryParams) o a `/perfil`.
3. On 401 `urn:academconnect:error:bad-credentials` → mensaje inline en el form ("Correo o contraseña incorrectos").
4. On 409 `urn:academconnect:error:business-rule` (cuenta desactivada) → mensaje claro de cuenta inactiva.

**Tests**
- Component test (Karma o Vitest según preferencia del CLI 19+): renderiza, valida required/email, dispara `AuthService.login` con el payload correcto.

---

## Fase 5 — Layout autenticado

Una vez logueado, todo vive bajo el shell con sidebar (igual al prototipo, pantallas 02/03/07/08).

**`layout/shell/shell.component.ts`** — `<router-outlet>` central + sidebar a la izquierda + header arriba (search + avatar + notif).

**`layout/sidebar/sidebar.component.ts`** — secciones agrupadas con subtítulos en mayúsculas (TRABAJO/COMUNIDAD/ANÁLISIS para evaluador; ACADÉMICO/PERSONAL/SISTEMA para estudiante). Items se derivan del rol del usuario actual. Para esta entrega solo el item "Mi perfil" está activo; el resto son placeholders deshabilitados.

**`layout/header/header.component.ts`** — barra superior con search desactivado (futuro), avatar + dropdown con "Cerrar sesión" funcional, toggle de tema visible pero inactivo, campana de notif desactivada.

**Routing** (`app.routes.ts`):
```
/login → LoginPage (sin shell)
/ → shell layout
  /perfil → PerfilPropioPage (auth.guard)
  /** → redirect a /perfil
```

---

## Fase 6 — Perfil propio (pantallas 07 + 08, según rol)

Ruta: `/perfil`. Component `PerfilPropioPageComponent`.

**Datos**
- Al entrar, llama `GET /me/perfil`.
- Si `rol === 'ESTUDIANTE'`, renderiza variante de pantalla 07.
- Si `rol === 'PROFESOR' || 'EXTERNO'`, renderiza variante de pantalla 08 (evaluador).
- Si `rol === 'ADMINISTRADOR'`, renderiza una vista básica con datos personales (sin stats de evaluador, sin publicaciones).

**Componentes**
- **`perfil-header`** — banner con gradiente navy + avatar/iniciales grande + nombre serif (`Mateo Rivas` o `Dra. Elena Castaño`) + chip de rol + badge "Verificado" (hardcoded mientras no haya estado en backend) + facultad/depto/institución (de `titulacion/cargo/institucion`). Botones "Contactar" y "Seguir" visibles pero deshabilitados.
- **`perfil-stats`** — fila de 4 stat-cards. Variante por rol:
  - **Estudiante**: Trabajos activos / Publicados (`trabajosPublicados`) / ~~Citaciones~~ (G05 — fuera) / ~~Score promedio~~ (G04 — fuera). Quedan 2 KPIs. Se rellena el espacio con cards más anchos o se agregan otros (ej. "Áreas de interés N").
  - **Evaluador**: consume `GET /evaluador/me/stats` (existe tras G22) → `{evaluacionesCompletadas, tiempoMedioRespuestaDias, scoreMedioDado, distribucionVeredictos}`. ~~Acuerdo con par~~ (G22 — fuera).
- **`bio-academica`** — card con `biografia` mostrada como cita. Editable con click → abre modal/inline edit.
- **`lineas-investigacion`** — chips de `areas` (sin barras de progreso, G10). Editable: link "Editar áreas" abre modal con multi-select contra `GET /api/areas` y guarda con `PUT /me/areas`.
- **`reconocimientos`** — grid de badges. Consume `GET /api/usuarios/{userId}/reconocimientos`. Solo lectura (la creación es admin-only, fuera de scope).
- **`publicaciones-recientes`** — solo en variante estudiante. **Endpoint pendiente en backend** (`GET /estudiante/me/trabajos` se cerró en G03 — verificar que está implementado en F13 antes de consumirlo). Si no está, mostrar placeholder "Tus trabajos aparecerán acá cuando publiques tu primero".
- **`editar-perfil-form`** — modal/drawer con form reactivo contra `PUT /me/perfil`. Campos: nombre, ubicación, biografía, fotoUrl, edad, password (opcional con confirm), y campos por rol (titulación/cargo/institución/título). Validaciones espejo de las del backend (`@NotBlank`, `@Size(8-255)` en password, `@Size(max=500)` en fotoUrl).

**Carga / errores**
- Skeleton loading mientras el `GET /me/perfil` resuelve.
- Si 401 → al login (lo maneja el error.interceptor).
- Si el PUT falla con `urn:academconnect:error:validation` → marcar campos inválidos con el detalle del `ProblemDetail`.

**Tests**
- Component tests: renderiza variante correcta según rol; abre modal de edición; submitea PUT con payload válido.

---

## Fase 7 — Build, lint y verificación

**Comandos de desarrollo del usuario**
- Backend: `docker compose up -d && ./mvnw spring-boot:run` (en `academconnect`).
- Frontend: `ng serve` (en `academconnect-web`, sirve en `http://localhost:4200`).

**Verificación end-to-end**
1. Subir backend → confirmar que `/auth/login` setea cookie httpOnly.
2. Subir frontend → abrir `http://localhost:4200`, debería redirigir a `/login`.
3. Login con un usuario seed (crear vía SQL/REST si no hay):
  - Esperado: cookie `ac_jwt` visible en devtools (Application → Cookies), pestaña Network muestra `Set-Cookie` en la response.
  - Esperado: el `Authorization` header **no** se envía en requests posteriores; solo la cookie va automáticamente (con `withCredentials`).
  - Esperado: redirección a `/perfil`.
4. En `/perfil`:
  - Renderiza variante correcta según rol.
  - Stats coinciden con backend (verificar con `curl -b cookies.txt /me/perfil`).
  - Edit → guardar → recarga el perfil con los nuevos datos.
  - Logout → cookie borrada, redirección a `/login`, intento de volver a `/perfil` redirige a `/login`.
5. Refresh del browser en `/perfil` → no pide login de nuevo (la cookie sobrevive y `restoreSession()` valida).

**Lint / build**
- `ng lint` debe pasar.
- `ng build` debe pasar y producir un bundle < ~500KB inicial (presupuesto razonable para esta entrega).

---

## Archivos críticos por fase

| Fase | Archivos clave |
|------|----------------|
| 0 | `academconnect/src/main/java/com/academconnect/controller/AuthController.java`, `config/SecurityConfig.java` |
| 1 | `academconnect-web/angular.json`, `tsconfig.json`, `src/app/app.routes.ts`, `environments/environment.ts` |
| 2 | `src/styles/_tokens.scss`, `_typography.scss`, `main.scss`, `shared/ui/*` |
| 3 | `core/auth/auth.service.ts`, `auth.interceptor.ts`, `auth.guard.ts`, `role.guard.ts`, `core/http/error.interceptor.ts` |
| 4 | `features/auth/login-page/*`, `auth.routes.ts` |
| 5 | `layout/shell/*`, `sidebar/*`, `header/*`, `app.routes.ts` |
| 6 | `features/perfil/perfil-propio-page/*`, `components/perfil-header/*`, `perfil-stats/*`, `bio-academica/*`, `lineas-investigacion/*`, `reconocimientos/*`, `publicaciones-recientes/*`, `editar-perfil-form/*` |

---

## Lo que queda explícitamente fuera de esta entrega

- Registro de usuarios (cualquier rol).
- Dashboards (pantallas 02, 03 del prototipo).
- Repositorio (pantalla 04).
- Sistema de evaluación (pantallas 05, 06).
- Perfil público de **otro usuario** (`GET /api/usuarios/{id}/perfil` — endpoint no existe en backend; queda como gap menor).
- Edición de reconocimientos y disponibilidad de evaluador (heatmap pantalla 08).
- i18n / dark mode / toggle de idioma.
- Notificaciones push o feed de actividad en vivo.

## Estimación gruesa

- Fase 0 (backend cookie): 0.5 día.
- Fase 1 (scaffold): 0.5 día.
- Fase 2 (tokens + UI base): 1.5 días.
- Fase 3 (core auth): 1 día.
- Fase 4 (login): 1 día.
- Fase 5 (layout/shell): 1 día.
- Fase 6 (perfil propio + edición): 2 días.
- Fase 7 (verificación + ajustes): 0.5 día.

**Total: ~8 días** de trabajo full-time para un dev.

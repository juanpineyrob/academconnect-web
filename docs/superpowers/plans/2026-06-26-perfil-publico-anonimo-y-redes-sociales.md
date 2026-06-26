# Acceso anónimo a repositorio/perfiles y enlaces a redes sociales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un usuario no autenticado navegue el repositorio (lista, filtros y detalle con descarga de PDF) y los perfiles públicos por URL, y que alumnos/profesores publiquen enlaces a GitHub, LinkedIn, ORCID y sitio web en su perfil.

**Architecture:** Dos fases. Fase A desbloquea el acceso anónimo: el `errorInterceptor` deja de expulsar al login cuando no había sesión, el `Header` no carga el feed para anónimos, y el backend expone los endpoints que faltan (`/api/areas-tematicas`, `GET /api/trabajos/{id}` con guarda de 404 para trabajos no aprobados vistos por anónimos). Fase B agrega 4 columnas de redes a `Usuario`, las expone en los DTOs de perfil, las edita el form (solo ESTUDIANTE/PROFESOR) y las renderiza dinámicamente `perfil-header`.

**Tech Stack:** Frontend Angular 21 (standalone, signals, OnPush, native control flow), Vitest browser. Backend Spring Boot 3 + Spring Security + JPA + Flyway + Postgres.

## Global Constraints

- Angular: componentes standalone, **sin** `standalone: true` en el decorador; `input()`/`output()`; `computed()` para derivados; `ChangeDetectionStrategy.OnPush`; control flow nativo (`@if/@for/@switch`); `inject()`; **no** `ngClass`/`ngStyle` (usar bindings `class`/`style`); rutas de templates/estilos relativas al `.ts`.
- Iconos de marca como **SVG inline** (no `NgOptimizedImage`, que no soporta inline).
- Accesibilidad: pasar AXE; WCAG AA (foco visible, contraste, nombres accesibles en los links).
- Runner de tests FE: **Vitest** (`npm run test`). Globals de Vitest: `describe/it/expect/vi`.
- Backend: Flyway corre con `validate`; **una migración por la entidad afectada** (versión nueva). Tests con `./mvnw test`.
- Git: commits **directos en `main`**, con **rutas explícitas** en `git add` (nada de `git add -A`), **sin** trailer `Co-Authored-By`, **sin push** (lo hace el usuario). El repo backend vive en `/home/ignacio/Projects/academconnect`; el frontend en `/home/ignacio/Projects/academconnect-web`.

---

## File Structure

### Frontend (`/home/ignacio/Projects/academconnect-web`)
- `src/app/core/http/error.interceptor.ts` — redirigir a `/login` solo si había sesión.
- `src/app/core/http/error.interceptor.spec.ts` (**crear**) — tests del interceptor.
- `src/app/layout/header/header.html` — no renderizar `<ac-feed-dropdown />` si no hay usuario.
- `src/app/features/perfil/perfil.models.ts` — 4 campos de redes en `Perfil`, `PerfilPublico`, `PerfilUpdateRequest`.
- `src/app/features/perfil/components/perfil-header/perfil-header.ts` + `.html` + `.scss` — fila de iconos dinámica.
- `src/app/features/perfil/components/perfil-header/perfil-header.spec.ts` (**crear**) — render de redes.
- `src/app/features/perfil/components/editar-perfil-form/editar-perfil-form.ts` + `.html` — sección "Enlaces y redes" (ESTUDIANTE/PROFESOR).
- `src/app/features/perfil/components/editar-perfil-form/editar-perfil-form.spec.ts` (**crear**) — payload de redes por rol.

### Backend (`/home/ignacio/Projects/academconnect`)
- `src/main/java/com/academconnect/config/SecurityConfig.java` — whitelist GET.
- `src/main/java/com/academconnect/controller/TrabajoController.java` — detalle público con guarda anónimo.
- `src/main/resources/db/migration/V10__redes_sociales_usuario.sql` (**crear**) — 4 columnas.
- `src/main/java/com/academconnect/domain/Usuario.java` — 4 campos.
- `src/main/java/com/academconnect/dto/PerfilUpdateRequest.java` — 4 campos validados.
- `src/main/java/com/academconnect/dto/PerfilResponse.java` — 4 campos.
- `src/main/java/com/academconnect/dto/PerfilPublicoResponse.java` — 4 campos.
- `src/main/java/com/academconnect/service/PerfilService.java` — set + mapeo de redes.
- `src/test/java/com/academconnect/controller/TrabajoControllerPublicTests.java` (**crear**) — detalle anónimo.
- `src/test/java/com/academconnect/service/PerfilServiceTests.java` — persistencia de redes.

---

## Phase A — Desbloquear acceso anónimo

### Task 1: `errorInterceptor` no expulsa al anónimo

**Files:**
- Modify: `src/app/core/http/error.interceptor.ts`
- Test: `src/app/core/http/error.interceptor.spec.ts` (crear)

**Interfaces:**
- Consumes: `AuthService.currentUser` (signal `() => CurrentUser | null`), `Router.navigate`, `Router.url`.
- Produces: comportamiento — redirige a `/login` **solo** si `auth.currentUser() !== null` al momento del 401.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/app/core/http/error.interceptor.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';

import { errorInterceptor } from './error.interceptor';
import { AuthService } from '@core/auth/auth.service';
import type { CurrentUser } from '@core/auth/models';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpCtrl: HttpTestingController;
  let userSig: ReturnType<typeof signal<CurrentUser | null>>;
  const clearSession = vi.fn();
  const navigate = vi.fn();

  beforeEach(() => {
    userSig = signal<CurrentUser | null>(null);
    clearSession.mockClear();
    navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly(), clearSession } },
        { provide: Router, useValue: { url: '/repositorio', navigate } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpCtrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpCtrl.verify());

  it('no redirige ni limpia sesión en 401 si era anónimo', () => {
    http.get('/x').subscribe({ next: () => undefined, error: () => undefined });
    httpCtrl.expectOne('/x').flush('', { status: 401, statusText: 'Unauthorized' });
    expect(navigate).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('redirige a /login en 401 si había sesión activa', () => {
    userSig.set({ userId: 1, nombre: 'U', email: 'u@x', rol: 'ESTUDIANTE', fotoUrl: null });
    http.get('/y').subscribe({ next: () => undefined, error: () => undefined });
    httpCtrl.expectOne('/y').flush('', { status: 401, statusText: 'Unauthorized' });
    expect(clearSession).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/repositorio' } });
  });
});
```

- [ ] **Step 2: Correr el test → falla**

Run: `npm run test -- --run error.interceptor`
Expected: FAIL (el caso "anónimo" falla: hoy redirige siempre).

- [ ] **Step 3: Implementar el cambio**

En `src/app/core/http/error.interceptor.ts`, reemplazar el bloque del `if (err.status === 401 ...)`:

```ts
      const isLogin = req.url.endsWith('/auth/login');
      const teniaSesion = auth.currentUser() !== null;
      if (err.status === 401 && !isLogin && teniaSesion) {
        auth.clearSession();
        void router.navigate(['/login'], {
          queryParams: { returnUrl: router.url },
        });
      }
```

- [ ] **Step 4: Correr el test → pasa**

Run: `npm run test -- --run error.interceptor`
Expected: PASS (ambos casos).

- [ ] **Step 5: Commit**

```bash
cd /home/ignacio/Projects/academconnect-web
git add src/app/core/http/error.interceptor.ts src/app/core/http/error.interceptor.spec.ts
git commit -m "fix(auth): el interceptor solo redirige a login si había sesión (no expulsa al anónimo)"
```

### Task 2: `Header` no carga el feed para anónimos

**Files:**
- Modify: `src/app/layout/header/header.html`

**Interfaces:**
- Consumes: `user()` (`AuthService.currentUser`) ya disponible en `Header`.

> Nota: el `Sidebar` ya tolera anónimo vía `SECTIONS_ANONIMO` (`src/app/layout/sidebar/sidebar.ts:94`). No requiere cambios; solo verificarlo en el smoke test.

- [ ] **Step 1: Condicionar el feed-dropdown**

En `src/app/layout/header/header.html`, reemplazar la línea 47:

```html
  <ac-feed-dropdown />
```

por:

```html
  @if (user()) {
    <ac-feed-dropdown />
  }
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 3: Smoke manual — anónimo**

Levantar el dev server (`npm start`), abrir `/repositorio` sin sesión: la topbar muestra "Ingresar", no aparece el dropdown de feed, el sidebar muestra solo "Repositorio", y nada redirige a `/login`.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout/header/header.html
git commit -m "feat(shell): no cargar el feed de actividad para usuarios anónimos"
```

### Task 3: Backend — whitelist de áreas y detalle de trabajo

**Files:**
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/config/SecurityConfig.java`

**Interfaces:**
- Produces: GET anónimo permitido para `/api/areas-tematicas` y `/api/trabajos/*` (un segmento → solo `/buscar` y `/{id}`).

- [ ] **Step 1: Agregar matchers a la whitelist GET**

En `SecurityConfig.java`, dentro del `.requestMatchers(HttpMethod.GET, ...)` (líneas 49-55), agregar dos entradas a la lista existente:

```java
                        .requestMatchers(HttpMethod.GET,
                                "/public/**",
                                "/storage/avatars/**",
                                "/api/areas-tematicas",
                                "/api/trabajos/buscar",
                                "/api/trabajos/*",
                                "/api/trabajos/*/archivo",
                                "/api/usuarios/*/perfil",
                                "/api/usuarios/*/reconocimientos").permitAll()
```

> `/api/trabajos/*` matchea un único segmento, así que abre `/api/trabajos/{id}` y `/api/trabajos/buscar`; **no** abre `/api/trabajos/{id}/solicitudes` ni `/{id}/invitaciones` (siguen protegidos por `@PreAuthorize`).

- [ ] **Step 2: Compilar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q compile`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
cd /home/ignacio/Projects/academconnect
git add src/main/java/com/academconnect/config/SecurityConfig.java
git commit -m "feat(security): exponer GET /api/areas-tematicas y /api/trabajos/{id} a anónimos"
```

### Task 4: Backend — detalle público con guarda de 404 para no aprobados

**Files:**
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/controller/TrabajoController.java`
- Test: `/home/ignacio/Projects/academconnect/src/test/java/com/academconnect/controller/TrabajoControllerPublicTests.java` (crear)

**Interfaces:**
- Consumes: `service.buscarPorId(Long)` → `TrabajoResponse` (campo `estado()` de tipo `EstadoTrabajo`); `ResourceNotFoundException(String, Object)`.
- Produces: `GET /api/trabajos/{id}` → 200 si autenticado o si `estado == APROBADO`; 404 si anónimo y `estado != APROBADO`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/test/java/com/academconnect/controller/TrabajoControllerPublicTests.java`:

```java
package com.academconnect.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.academconnect.TestcontainersConfiguration;
import com.academconnect.domain.EstadoTrabajo;
import com.academconnect.domain.Estudiante;
import com.academconnect.domain.Profesor;
import com.academconnect.domain.TipoTrabajo;
import com.academconnect.domain.Trabajo;
import com.academconnect.dto.EstudianteRequest;
import com.academconnect.dto.ProfesorRequest;
import com.academconnect.repository.EstudianteRepository;
import com.academconnect.repository.ProfesorRepository;
import com.academconnect.repository.TrabajoRepository;
import com.academconnect.service.EstudianteService;
import com.academconnect.service.ProfesorService;

import java.util.List;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
public class TrabajoControllerPublicTests {

    @Autowired private MockMvc mockMvc;
    @Autowired private EstudianteService estudianteService;
    @Autowired private ProfesorService profesorService;
    @Autowired private EstudianteRepository estudianteRepository;
    @Autowired private ProfesorRepository profesorRepository;
    @Autowired private TrabajoRepository trabajoRepository;

    private Long aprobadoId;
    private Long enDesarrolloId;

    @BeforeEach
    void seed() {
        Long estId = estudianteService.crear(
                new EstudianteRequest("pub-est@example.com", "password123", "Est Pub", null, null, null)).id();
        Long profId = profesorService.crear(
                new ProfesorRequest("pub-prof@example.com", "password123", "Prof Pub", null, null, null, null, null)).id();
        Estudiante est = estudianteRepository.findById(estId).orElseThrow();
        Profesor prof = profesorRepository.findById(profId).orElseThrow();

        aprobadoId = saveTrabajo(prof, est, TipoTrabajo.TCC, EstadoTrabajo.APROBADO);
        enDesarrolloId = saveTrabajo(prof, est, TipoTrabajo.PAPER, EstadoTrabajo.EN_DESARROLLO);
    }

    private Long saveTrabajo(Profesor prof, Estudiante est, TipoTrabajo tipo, EstadoTrabajo estado) {
        Trabajo t = new Trabajo();
        t.setTitulo("T " + tipo + " " + estado);
        t.setTipo(tipo);
        t.setEstado(estado);
        t.setOrientador(prof);
        t.setEstudiante(est);
        t.setKeywords(List.of("kw1", "kw2"));
        return trabajoRepository.saveAndFlush(t).getId();
    }

    @Test
    void anonimo_ve_trabajo_aprobado() throws Exception {
        mockMvc.perform(get("/api/trabajos/{id}", aprobadoId))
                .andExpect(status().isOk());
    }

    @Test
    void anonimo_no_ve_trabajo_no_aprobado_recibe_404() throws Exception {
        mockMvc.perform(get("/api/trabajos/{id}", enDesarrolloId))
                .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 2: Correr el test → falla**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=TrabajoControllerPublicTests`
Expected: FAIL — hoy el endpoint exige `isAuthenticated()` (403/401), no 200/404.

- [ ] **Step 3: Implementar la guarda en el controller**

En `TrabajoController.java`, reemplazar el método `buscarPorId` (líneas 86-90):

```java
    @GetMapping("/{id}")
    public TrabajoResponse buscarPorId(@PathVariable Long id, Authentication authentication) {
        TrabajoResponse trabajo = service.buscarPorId(id);
        boolean anonimo = authentication == null;
        if (anonimo && trabajo.estado() != EstadoTrabajo.APROBADO) {
            throw new ResourceNotFoundException("Trabajo", id);
        }
        return trabajo;
    }
```

Quitar la anotación `@PreAuthorize("isAuthenticated()")` de ese método. Asegurar los imports
(en el mismo archivo o agregarlos): `org.springframework.security.core.Authentication` (ya usado
por `buscar`), `com.academconnect.domain.EstadoTrabajo`, `com.academconnect.exception.ResourceNotFoundException`.

- [ ] **Step 4: Correr el test → pasa**

Run: `./mvnw -q test -Dtest=TrabajoControllerPublicTests`
Expected: PASS (ambos casos).

- [ ] **Step 5: Commit**

```bash
cd /home/ignacio/Projects/academconnect
git add src/main/java/com/academconnect/controller/TrabajoController.java \
        src/test/java/com/academconnect/controller/TrabajoControllerPublicTests.java
git commit -m "feat(trabajos): detalle público; 404 a anónimos si el trabajo no está aprobado"
```

---

## Phase B — Enlaces a redes sociales

### Task 5: Backend — migración y columnas en `Usuario`

**Files:**
- Create: `/home/ignacio/Projects/academconnect/src/main/resources/db/migration/V10__redes_sociales_usuario.sql`
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/domain/Usuario.java`

**Interfaces:**
- Produces: getters/setters `getGithubUrl/setGithubUrl`, `getLinkedinUrl/setLinkedinUrl`, `getOrcidUrl/setOrcidUrl`, `getSitioWebUrl/setSitioWebUrl` (Lombok `@Getter/@Setter`).

- [ ] **Step 1: Crear la migración**

Crear `src/main/resources/db/migration/V10__redes_sociales_usuario.sql`:

```sql
ALTER TABLE usuario
    ADD COLUMN github_url    VARCHAR(500),
    ADD COLUMN linkedin_url  VARCHAR(500),
    ADD COLUMN orcid_url     VARCHAR(500),
    ADD COLUMN sitio_web_url VARCHAR(500);
```

- [ ] **Step 2: Agregar las columnas a la entidad**

En `Usuario.java`, después del campo `fotoUrl` (línea ~67), agregar:

```java
    @Column(name = "github_url", length = 500)
    private String githubUrl;

    @Column(name = "linkedin_url", length = 500)
    private String linkedinUrl;

    @Column(name = "orcid_url", length = 500)
    private String orcidUrl;

    @Column(name = "sitio_web_url", length = 500)
    private String sitioWebUrl;
```

- [ ] **Step 3: Levantar y verificar que Flyway aplica V10**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=PerfilServiceTests`
Expected: PASS — el contexto arranca, Flyway aplica V10 y `validate` no se queja (entidad ↔ schema alineados).

- [ ] **Step 4: Commit**

```bash
cd /home/ignacio/Projects/academconnect
git add src/main/resources/db/migration/V10__redes_sociales_usuario.sql \
        src/main/java/com/academconnect/domain/Usuario.java
git commit -m "feat(usuario): columnas de redes sociales (github, linkedin, orcid, sitio web)"
```

### Task 6: Backend — DTOs y persistencia de redes

**Files:**
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/PerfilUpdateRequest.java`
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/PerfilResponse.java`
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/PerfilPublicoResponse.java`
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/service/PerfilService.java`
- Test: `/home/ignacio/Projects/academconnect/src/test/java/com/academconnect/service/PerfilServiceTests.java`

**Interfaces:**
- Consumes: `Usuario` getters/setters de redes (Task 5).
- Produces: `PerfilUpdateRequest` con `githubUrl, linkedinUrl, orcidUrl, sitioWebUrl`; ambos response records exponen esos 4 campos; `PerfilService.actualizarPerfil` los persiste solo para ESTUDIANTE/PROFESOR.

- [ ] **Step 1: Escribir el test que falla**

En `PerfilServiceTests.java` agregar un test que verifique persistencia para un `Profesor`. Usar el
patrón Mockito ya presente en el archivo (`@InjectMocks PerfilService`, `@Mock UsuarioRepository`,
`UsuarioFactory`). Agregar:

```java
    @Test
    void actualizarPerfil_persiste_redes_para_profesor() {
        Profesor prof = UsuarioFactory.profesor("prof@example.com");
        Mockito.when(usuarioRepository.findByEmail("prof@example.com")).thenReturn(Optional.of(prof));
        Mockito.when(usuarioRepository.save(Mockito.any())).thenAnswer(i -> i.getArgument(0));

        var req = new com.academconnect.dto.PerfilUpdateRequest(
                "Prof", null, null, null, null, null, null, null, null, null,
                "https://github.com/x", "https://linkedin.com/in/x", "https://orcid.org/0000", "https://x.dev");

        perfilService.actualizarPerfil("prof@example.com", req);

        Assertions.assertEquals("https://github.com/x", prof.getGithubUrl());
        Assertions.assertEquals("https://linkedin.com/in/x", prof.getLinkedinUrl());
        Assertions.assertEquals("https://orcid.org/0000", prof.getOrcidUrl());
        Assertions.assertEquals("https://x.dev", prof.getSitioWebUrl());
    }
```

> Confirmar el helper exacto de `UsuarioFactory` para crear un `Profesor` (el import `com.academconnect.factories.UsuarioFactory` ya está en el archivo). El constructor de `PerfilUpdateRequest` arriba asume el orden definido en Step 2 (10 campos previos + 4 de redes).

- [ ] **Step 2: Agregar campos al `PerfilUpdateRequest`**

Reemplazar el record completo en `PerfilUpdateRequest.java`:

```java
package com.academconnect.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record PerfilUpdateRequest(
        @NotBlank @Size(max = 200) String nombre,
        Integer edad,
        @Size(max = 200) String ubicacion,
        String biografia,
        @Size(max = 500) String fotoUrl,
        @Size(min = 8, max = 255) String password,
        @Size(max = 200) String titulacion,
        @Size(max = 200) String cargo,
        @Size(max = 200) String institucion,
        @Size(max = 200) String titulo,
        @Size(max = 500) @Pattern(regexp = "^https?://.+", message = "Debe ser una URL http(s) válida") String githubUrl,
        @Size(max = 500) @Pattern(regexp = "^https?://.+", message = "Debe ser una URL http(s) válida") String linkedinUrl,
        @Size(max = 500) @Pattern(regexp = "^https?://.+", message = "Debe ser una URL http(s) válida") String orcidUrl,
        @Size(max = 500) @Pattern(regexp = "^https?://.+", message = "Debe ser una URL http(s) válida") String sitioWebUrl) {
}
```

> `@Pattern` ignora valores `null`, así que los campos vacíos (que el frontend envía como `null`) no fallan la validación.

- [ ] **Step 3: Agregar campos a los response records**

En `PerfilResponse.java`, agregar 4 componentes al final del record (después de `Instant updatedAt`):

```java
        Instant createdAt,
        Instant updatedAt,
        String githubUrl,
        String linkedinUrl,
        String orcidUrl,
        String sitioWebUrl) {
```

En `PerfilPublicoResponse.java`, agregar 4 componentes al final (después de `Instant createdAt`):

```java
        int trabajosPublicados,
        Instant createdAt,
        String githubUrl,
        String linkedinUrl,
        String orcidUrl,
        String sitioWebUrl) {
```

- [ ] **Step 4: Persistir y mapear en `PerfilService`**

En `actualizarPerfil` (después del bloque `if (request.password() ...)`, antes del `if (usuario instanceof Profesor p)`), agregar:

```java
        if (usuario instanceof Estudiante || usuario instanceof Profesor) {
            usuario.setGithubUrl(request.githubUrl());
            usuario.setLinkedinUrl(request.linkedinUrl());
            usuario.setOrcidUrl(request.orcidUrl());
            usuario.setSitioWebUrl(request.sitioWebUrl());
        }
```

En `toPerfilResponse`, agregar al final del `new PerfilResponse(...)` (después de `u.getUpdatedAt()`):

```java
                u.getCreatedAt(),
                u.getUpdatedAt(),
                u.getGithubUrl(),
                u.getLinkedinUrl(),
                u.getOrcidUrl(),
                u.getSitioWebUrl());
```

En `toPerfilPublicoResponse`, agregar al final del `new PerfilPublicoResponse(...)` (después de `u.getCreatedAt()`):

```java
                (int) publicados,
                u.getCreatedAt(),
                u.getGithubUrl(),
                u.getLinkedinUrl(),
                u.getOrcidUrl(),
                u.getSitioWebUrl());
```

> `Estudiante` ya está importado en `PerfilService` (se usa en `actualizarAreas`/`computarAreas`).

- [ ] **Step 5: Correr tests → pasan**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=PerfilServiceTests`
Expected: PASS (incluye el nuevo caso).

- [ ] **Step 6: Commit**

```bash
cd /home/ignacio/Projects/academconnect
git add src/main/java/com/academconnect/dto/PerfilUpdateRequest.java \
        src/main/java/com/academconnect/dto/PerfilResponse.java \
        src/main/java/com/academconnect/dto/PerfilPublicoResponse.java \
        src/main/java/com/academconnect/service/PerfilService.java \
        src/test/java/com/academconnect/service/PerfilServiceTests.java
git commit -m "feat(perfil): exponer y persistir redes sociales (alumno/profesor) en los DTOs de perfil"
```

### Task 7: Frontend — modelos de redes

**Files:**
- Modify: `src/app/features/perfil/perfil.models.ts`

**Interfaces:**
- Produces: campos `githubUrl, linkedinUrl, orcidUrl, sitioWebUrl` en `Perfil` y `PerfilPublico` (`string | null`), y opcionales en `PerfilUpdateRequest`.

- [ ] **Step 1: Agregar los campos**

En `Perfil` (después de `titulo: string | null;`, antes de `areas`):

```ts
  githubUrl: string | null;
  linkedinUrl: string | null;
  orcidUrl: string | null;
  sitioWebUrl: string | null;
```

En `PerfilPublico` (mismo lugar, antes de `areas`):

```ts
  githubUrl: string | null;
  linkedinUrl: string | null;
  orcidUrl: string | null;
  sitioWebUrl: string | null;
```

En `PerfilUpdateRequest` (después de `titulo?: string | null;`):

```ts
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  orcidUrl?: string | null;
  sitioWebUrl?: string | null;
```

- [ ] **Step 2: Build**

Run: `cd /home/ignacio/Projects/academconnect-web && npm run build`
Expected: compila sin errores TS.

- [ ] **Step 3: Commit**

```bash
cd /home/ignacio/Projects/academconnect-web
git add src/app/features/perfil/perfil.models.ts
git commit -m "feat(perfil): tipos de redes sociales en Perfil, PerfilPublico y PerfilUpdateRequest"
```

### Task 8: Frontend — edición de redes (ESTUDIANTE/PROFESOR)

**Files:**
- Modify: `src/app/features/perfil/components/editar-perfil-form/editar-perfil-form.ts`
- Modify: `src/app/features/perfil/components/editar-perfil-form/editar-perfil-form.html`
- Test: `src/app/features/perfil/components/editar-perfil-form/editar-perfil-form.spec.ts` (crear)

**Interfaces:**
- Consumes: `Perfil` con campos de redes (Task 7); `EditarPerfilSavePayload.payload: PerfilUpdateRequest`.
- Produces: el `save` output incluye `githubUrl/linkedinUrl/orcidUrl/sitioWebUrl` (o `null`) cuando el rol es ESTUDIANTE o PROFESOR; no los incluye para EXTERNO.

- [ ] **Step 1: Escribir el test que falla**

Crear `editar-perfil-form.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { EditarPerfilForm, EditarPerfilSavePayload } from './editar-perfil-form';
import type { Perfil } from '../../perfil.models';

function mkPerfil(rol: Perfil['rol']): Perfil {
  return {
    id: 1, email: 'u@x', nombre: 'U', activo: true, rol, edad: null,
    ubicacion: null, biografia: null, fotoUrl: null, titulacion: null, cargo: null,
    institucion: null, titulo: null,
    githubUrl: null, linkedinUrl: null, orcidUrl: null, sitioWebUrl: null,
    areas: [], trabajosPublicados: 0, createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function setup(rol: Perfil['rol']) {
  const fixture = TestBed.createComponent(EditarPerfilForm);
  fixture.componentRef.setInput('perfil', mkPerfil(rol));
  fixture.detectChanges();
  return fixture;
}

describe('EditarPerfilForm — redes', () => {
  it('ESTUDIANTE: incluye redes en el payload', () => {
    const fixture = setup('ESTUDIANTE');
    const cmp = fixture.componentInstance as unknown as {
      form: { controls: Record<string, { setValue(v: unknown): void }> };
      onSubmit(): void;
    };
    cmp.form.controls['githubUrl'].setValue('https://github.com/x');
    let payload: EditarPerfilSavePayload | undefined;
    fixture.componentInstance.save.subscribe((p) => (payload = p));
    cmp.onSubmit();
    expect(payload?.payload.githubUrl).toBe('https://github.com/x');
  });

  it('EXTERNO: no incluye redes en el payload', () => {
    const fixture = setup('EXTERNO');
    const cmp = fixture.componentInstance as unknown as { onSubmit(): void };
    let payload: EditarPerfilSavePayload | undefined;
    fixture.componentInstance.save.subscribe((p) => (payload = p));
    cmp.onSubmit();
    expect(payload?.payload.githubUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr el test → falla**

Run: `npm run test -- --run editar-perfil-form`
Expected: FAIL (no existen los controles ni la lógica de payload).

- [ ] **Step 3: Agregar controles y lógica en el `.ts`**

En el `this.fb.nonNullable.group({...})`, agregar tras `titulo`:

```ts
      githubUrl: ['', [Validators.maxLength(500), urlPattern()]],
      linkedinUrl: ['', [Validators.maxLength(500), urlPattern()]],
      orcidUrl: ['', [Validators.maxLength(500), urlPattern()]],
      sitioWebUrl: ['', [Validators.maxLength(500), urlPattern()]],
```

Agregar el computed (junto a `isProfesor`/`isExterno`):

```ts
  protected readonly showRedes = computed(
    () => this.perfil().rol === 'ESTUDIANTE' || this.perfil().rol === 'PROFESOR',
  );
```

En el `effect` `hydrate`, dentro del `this.form.reset({...})`, agregar:

```ts
      githubUrl: p.githubUrl ?? '',
      linkedinUrl: p.linkedinUrl ?? '',
      orcidUrl: p.orcidUrl ?? '',
      sitioWebUrl: p.sitioWebUrl ?? '',
```

En `onSubmit`, antes del `this.save.emit({...})`, agregar:

```ts
    if (this.showRedes()) {
      payload.githubUrl = emptyToNull(v.githubUrl);
      payload.linkedinUrl = emptyToNull(v.linkedinUrl);
      payload.orcidUrl = emptyToNull(v.orcidUrl);
      payload.sitioWebUrl = emptyToNull(v.sitioWebUrl);
    }
```

Al final del archivo, junto a `passwordsMatch()`, agregar el validador de URL:

```ts
function urlPattern(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = (control.value ?? '').trim();
    if (v.length === 0) return null;
    return /^https?:\/\/.+/.test(v) ? null : { url: true };
  };
}
```

- [ ] **Step 4: Agregar la sección al template**

En `editar-perfil-form.html`, después del `@if (isExterno()) { ... }` (línea ~117) y antes del fieldset de contraseña, agregar:

```html
      @if (showRedes()) {
        <fieldset class="drawer__group">
          <legend class="t-overline">Enlaces y redes</legend>
          <ac-input label="GitHub (URL)" type="text" autocomplete="url" formControlName="githubUrl" />
          <ac-input label="LinkedIn (URL)" type="text" autocomplete="url" formControlName="linkedinUrl" />
          <ac-input label="ORCID (URL)" type="text" autocomplete="url" formControlName="orcidUrl" />
          <ac-input label="Sitio web (URL)" type="text" autocomplete="url" formControlName="sitioWebUrl" />
        </fieldset>
      }
```

> `ac-input` no soporta `type="url"` (solo `text|email|password|number`); se usa `type="text"` con `autocomplete="url"`.

- [ ] **Step 5: Correr el test → pasa**

Run: `npm run test -- --run editar-perfil-form`
Expected: PASS (ambos casos).

- [ ] **Step 6: Commit**

```bash
git add src/app/features/perfil/components/editar-perfil-form/editar-perfil-form.ts \
        src/app/features/perfil/components/editar-perfil-form/editar-perfil-form.html \
        src/app/features/perfil/components/editar-perfil-form/editar-perfil-form.spec.ts
git commit -m "feat(perfil): editar enlaces de redes (alumno/profesor) en el form de perfil"
```

### Task 9: Frontend — render dinámico de iconos en `perfil-header`

**Files:**
- Modify: `src/app/features/perfil/components/perfil-header/perfil-header.ts`
- Modify: `src/app/features/perfil/components/perfil-header/perfil-header.html`
- Modify: `src/app/features/perfil/components/perfil-header/perfil-header.scss`
- Test: `src/app/features/perfil/components/perfil-header/perfil-header.spec.ts` (crear)

**Interfaces:**
- Consumes: `perfil()` (`Perfil | PerfilPublico`) con campos de redes.
- Produces: `redes()` computed → `{ key: 'github'|'linkedin'|'orcid'|'web'; url: string; label: string }[]`, solo con los no vacíos.

- [ ] **Step 1: Escribir el test que falla**

Crear `perfil-header.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { PerfilHeader } from './perfil-header';
import type { PerfilPublico } from '../../perfil.models';

function mkPerfil(over: Partial<PerfilPublico>): PerfilPublico {
  return {
    id: 1, nombre: 'Ada', rol: 'ESTUDIANTE', biografia: null, ubicacion: null,
    fotoUrl: null, titulacion: null, cargo: null, institucion: null, titulo: null,
    githubUrl: null, linkedinUrl: null, orcidUrl: null, sitioWebUrl: null,
    areas: [], trabajosPublicados: 0, createdAt: '2026-01-01T00:00:00Z', ...over,
  };
}

describe('PerfilHeader — redes', () => {
  it('renderiza solo los enlaces cargados, con nombre accesible y target _blank', () => {
    const fixture = TestBed.createComponent(PerfilHeader);
    fixture.componentRef.setInput('perfil', mkPerfil({
      githubUrl: 'https://github.com/ada', linkedinUrl: 'https://linkedin.com/in/ada',
    }));
    fixture.detectChanges();
    const links = fixture.nativeElement.querySelectorAll('.perfil-header__redes a');
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe('https://github.com/ada');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(links[0].getAttribute('aria-label')).toContain('GitHub');
  });

  it('no renderiza la lista si no hay enlaces', () => {
    const fixture = TestBed.createComponent(PerfilHeader);
    fixture.componentRef.setInput('perfil', mkPerfil({}));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.perfil-header__redes')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test → falla**

Run: `npm run test -- --run perfil-header`
Expected: FAIL (no existe `.perfil-header__redes`).

- [ ] **Step 3: Agregar el computed en el `.ts`**

En `perfil-header.ts`, antes de `protected onEdit()`, agregar la interfaz y el computed:

```ts
  protected readonly redes = computed<RedSocial[]>(() => {
    const p = this.perfil() as Partial<Perfil>;
    const n = this.perfil().nombre;
    const out: RedSocial[] = [];
    if (p.githubUrl) out.push({ key: 'github', url: p.githubUrl, label: `GitHub de ${n}` });
    if (p.linkedinUrl) out.push({ key: 'linkedin', url: p.linkedinUrl, label: `LinkedIn de ${n}` });
    if (p.orcidUrl) out.push({ key: 'orcid', url: p.orcidUrl, label: `ORCID de ${n}` });
    if (p.sitioWebUrl) out.push({ key: 'web', url: p.sitioWebUrl, label: `Sitio web de ${n}` });
    return out;
  });
```

Y al final del archivo (fuera de la clase), la interfaz:

```ts
interface RedSocial {
  key: 'github' | 'linkedin' | 'orcid' | 'web';
  url: string;
  label: string;
}
```

- [ ] **Step 4: Agregar la lista al template**

En `perfil-header.html`, dentro de `.perfil-header__body`, después del bloque de `ubicacion`
(línea ~29) y antes de `.perfil-header__actions`, agregar:

```html
      @if (redes().length) {
        <ul class="perfil-header__redes" role="list">
          @for (r of redes(); track r.key) {
            <li>
              <a
                class="perfil-header__red"
                [href]="r.url"
                target="_blank"
                rel="noopener noreferrer"
                [attr.aria-label]="r.label">
                @switch (r.key) {
                  @case ('github') {
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
                    </svg>
                  }
                  @case ('linkedin') {
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0-.02-5ZM3 9h4v12H3V9Zm6 0h3.8v1.64h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.85V21H9V9Z" />
                    </svg>
                  }
                  @case ('orcid') {
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24ZM8.2 6.6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm-.85 3.2h1.7v8h-1.7v-8Zm3.6 0h3.2c2.6 0 4 1.7 4 4s-1.5 4-4 4h-3.2v-8Zm1.7 1.5v5h1.4c1.7 0 2.4-1 2.4-2.5s-.8-2.5-2.4-2.5h-1.4Z" />
                    </svg>
                  }
                  @default {
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                    </svg>
                  }
                }
              </a>
            </li>
          }
        </ul>
      }
```

- [ ] **Step 5: Agregar estilos**

En `perfil-header.scss`, agregar:

```scss
.perfil-header__redes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: var(--sp-2) 0 0;
  padding: 0;
  list-style: none;
}

.perfil-header__red {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  color: var(--c-text-muted);
  border: 1px solid var(--c-border-subtle, rgba(0, 0, 0, 0.12));
  transition: color var(--t-fast), border-color var(--t-fast);
}

.perfil-header__red:hover,
.perfil-header__red:focus-visible {
  color: var(--c-accent);
  border-color: var(--c-accent);
}
```

> Si `--sp-2`, `--t-fast`, `--c-accent` o `--c-text-muted` no existen con esos nombres, usar los tokens equivalentes ya presentes en `perfil-header.scss`/el design system.

- [ ] **Step 6: Correr el test → pasa**

Run: `npm run test -- --run perfil-header`
Expected: PASS (ambos casos).

- [ ] **Step 7: Commit**

```bash
git add src/app/features/perfil/components/perfil-header/perfil-header.ts \
        src/app/features/perfil/components/perfil-header/perfil-header.html \
        src/app/features/perfil/components/perfil-header/perfil-header.scss \
        src/app/features/perfil/components/perfil-header/perfil-header.spec.ts
git commit -m "feat(perfil): iconos de redes sociales dinámicos en la cabecera del perfil"
```

### Task 10: Verificación end-to-end

**Files:** ninguno (verificación manual + AXE).

- [ ] **Step 1: Build y tests completos**

```bash
cd /home/ignacio/Projects/academconnect-web && npm run build && npm run test -- --run
cd /home/ignacio/Projects/academconnect && ./mvnw -q test
```
Expected: build OK; suites FE y BE en verde.

- [ ] **Step 2: Recorrido anónimo**
  - Abrir `/repositorio` por URL sin sesión → carga, no redirige a login.
  - Filtrar por área (los chips de área cargan desde `/api/areas-tematicas`).
  - Entrar a un trabajo APROBADO `/repositorio/:id` → ve detalle y descarga el PDF.
  - Abrir `/repositorio/:id` de un trabajo no aprobado → "no encontrado" (404).
  - Click en el autor → `/usuarios/:id` → perfil sin email, con iconos de redes (si cargó).
  - `/perfil` y `/hub` siguen redirigiendo a `/login`.

- [ ] **Step 3: Recorrido autenticado**
  - Alumno y profesor: "Editar perfil" muestra la sección "Enlaces y redes"; cargar 1–4 URLs, guardar, recargar → persisten y aparecen los iconos.
  - Externo: la sección "Enlaces y redes" no aparece.
  - Iconos abren en pestaña nueva (`target="_blank"`, `rel="noopener noreferrer"`).

- [ ] **Step 4: AXE**

Con AXE DevTools sobre `/repositorio` y `/usuarios/:id`: sin violaciones; los links de redes tienen nombre accesible, foco visible y contraste AA.

---

## Self-Review

**Spec coverage:**
- Fase A (acceso anónimo): interceptor → Task 1; shell/header → Task 2 (sidebar ya existía); whitelist backend → Task 3; detalle público + 404 anónimo → Task 4. Incluye `/repositorio/:id` y descarga de PDF.
- Fase B (redes): migración + entidad → Task 5; DTOs + persistencia → Task 6; modelos FE → Task 7; edición (ESTUDIANTE/PROFESOR) → Task 8; render dinámico → Task 9.
- Verificación + AXE → Task 10.

**Type consistency:**
- Campos de redes: `githubUrl, linkedinUrl, orcidUrl, sitioWebUrl` en backend (entidad + 3 DTOs) y frontend (`Perfil`, `PerfilPublico`, `PerfilUpdateRequest`).
- `redes()` en `perfil-header` produce `{ key, url, label }` consumido solo por su propio template.
- `showRedes()` en el form: `rol === 'ESTUDIANTE' || rol === 'PROFESOR'`, alineado con la guarda de persistencia en `PerfilService` (`Estudiante || Profesor`).

**Open items (confirmar en ejecución):**
1. Orden de argumentos del constructor `PerfilUpdateRequest` en el test del Step 1 de Task 6 (10 previos + 4 redes) y helper exacto de `UsuarioFactory.profesor`.
2. Nombres de tokens SCSS en Task 9 Step 5 (ajustar a los existentes si difieren).
3. Firma de `EstudianteRequest`/`ProfesorRequest` en Task 4 (6 y 8 args respectivamente, según los records actuales).

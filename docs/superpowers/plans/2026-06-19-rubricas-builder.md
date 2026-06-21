# Rúbricas — Builder y gestión (Spec 1) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que profesores/evaluadores creen, editen y compartan (público/privado) rúbricas de evaluación generales, con un builder de criterios tipados y vista previa en vivo.

**Architecture:** Backend (`academconnect`, Spring Boot): migración aditiva en `template_evaluacion` (`visibilidad` + `autor_id`), apertura de roles y autorización por propiedad en `TemplateEvaluacionController`/`Service`. Frontend (`academconnect-web`, Angular 21): feature lazy `rubricas` con listado (Mías/Públicas) y builder de dos paneles que reutiliza `criterio-field` + el anillo de proyección para la preview.

**Tech Stack:** Spring Boot + JPA + MapStruct + Flyway + JUnit5/Mockito · Angular 21 (signals, reactive forms) + Vitest.

**Repos:** backend = `/home/ignacio/Projects/academconnect` · frontend = `/home/ignacio/Projects/academconnect-web`.

**Convención de commits:** sin trailer `Co-Authored-By`.

---

## FASE A — Backend: modelo de datos y autorización

### Task A1: Enum `Visibilidad` y campos en el dominio

**Files:**
- Create: `academconnect/src/main/java/com/academconnect/domain/Visibilidad.java`
- Modify: `academconnect/src/main/java/com/academconnect/domain/TemplateEvaluacion.java`

- [ ] **Step 1: Crear el enum**

```java
package com.academconnect.domain;

public enum Visibilidad {
    PUBLICO,
    PRIVADO
}
```

- [ ] **Step 2: Agregar campos al dominio** (en `TemplateEvaluacion`, después de `descripcion`; dejar `scope` nullable)

Cambiar la anotación de `scope` para que sea nullable y agregar `visibilidad` + `autor`:

```java
    @Enumerated(EnumType.STRING)
    @Column(length = 40)
    private TemplateScope scope; // DEPRECADO: las rúbricas son generales

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Visibilidad visibilidad = Visibilidad.PRIVADO;

    @jakarta.persistence.ManyToOne(fetch = jakarta.persistence.FetchType.LAZY)
    @jakarta.persistence.JoinColumn(name = "autor_id")
    private Usuario autor;
```

- [ ] **Step 3: Compilar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q -o compile`
Expected: BUILD SUCCESS (exit 0).

- [ ] **Step 4: Commit**

```bash
cd /home/ignacio/Projects/academconnect
git add src/main/java/com/academconnect/domain/Visibilidad.java src/main/java/com/academconnect/domain/TemplateEvaluacion.java
git commit -m "feat(rubricas): visibilidad y autor en TemplateEvaluacion"
```

### Task A2: Migración Flyway

**Files:**
- Create: `academconnect/src/main/resources/db/migration/V11__rubricas_visibilidad_autor.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Rúbricas generales con visibilidad y autor (Spec 1)
ALTER TABLE template_evaluacion ADD COLUMN visibilidad VARCHAR(20) NOT NULL DEFAULT 'PRIVADO';
ALTER TABLE template_evaluacion ADD COLUMN autor_id BIGINT REFERENCES usuario(id);
ALTER TABLE template_evaluacion ALTER COLUMN scope DROP NOT NULL;
ALTER TABLE template_evaluacion ADD CONSTRAINT chk_template_visibilidad
  CHECK (visibilidad IN ('PUBLICO','PRIVADO'));
```

- [ ] **Step 2: Verificar que arranca y migra**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q -o compile` (la app aplica Flyway al levantar; la verificación real ocurre al correr la app/tests de integración en tasks posteriores).
Expected: compila. (Si hay una instancia con devtools corriendo, reiniciará y aplicará V11.)

- [ ] **Step 3: Commit**

```bash
cd /home/ignacio/Projects/academconnect
git add src/main/resources/db/migration/V11__rubricas_visibilidad_autor.sql
git commit -m "feat(rubricas): migración V11 visibilidad + autor_id"
```

---

## FASE B — Backend: DTOs, mapper, servicio, autorización

### Task B1: DTOs request/response

**Files:**
- Modify: `academconnect/src/main/java/com/academconnect/dto/TemplateEvaluacionRequest.java`
- Modify: `academconnect/src/main/java/com/academconnect/dto/TemplateEvaluacionResponse.java`

- [ ] **Step 1: Reescribir el request** (quitar `scope`/`tipoTrabajoAplicable`, agregar `visibilidad`)

```java
package com.academconnect.dto;

import java.math.BigDecimal;

import com.academconnect.domain.Visibilidad;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record TemplateEvaluacionRequest(
        @NotBlank @Size(max = 200) String nombre,
        String descripcion,
        @NotNull Visibilidad visibilidad,
        @NotBlank String criterios,
        boolean activo,
        @NotNull @DecimalMin("0.0") BigDecimal umbralAprobacion) {
}
```

- [ ] **Step 2: Reescribir el response** (quitar scope/tipo, agregar visibilidad + autor)

```java
package com.academconnect.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.academconnect.domain.Visibilidad;

public record TemplateEvaluacionResponse(
        Long id,
        String nombre,
        String descripcion,
        Visibilidad visibilidad,
        Long autorId,
        String autorNombre,
        String criterios,
        boolean activo,
        BigDecimal umbralAprobacion,
        Instant createdAt,
        Instant updatedAt) {
}
```

- [ ] **Step 3: Commit** (compilará junto al mapper en B2; commitear igual)

```bash
cd /home/ignacio/Projects/academconnect
git add src/main/java/com/academconnect/dto/TemplateEvaluacionRequest.java src/main/java/com/academconnect/dto/TemplateEvaluacionResponse.java
git commit -m "feat(rubricas): DTOs con visibilidad y autor"
```

### Task B2: Mapper MapStruct

**Files:**
- Modify: `academconnect/src/main/java/com/academconnect/mapper/TemplateEvaluacionMapper.java`

- [ ] **Step 1: Ajustar mappings** (autor en response; ignorar autor/scope/tipo al construir/actualizar)

```java
package com.academconnect.mapper;

import com.academconnect.domain.TemplateEvaluacion;
import com.academconnect.dto.TemplateEvaluacionRequest;
import com.academconnect.dto.TemplateEvaluacionResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;

@Mapper(componentModel = "spring")
public interface TemplateEvaluacionMapper {

    @Mapping(target = "autorId", source = "autor.id")
    @Mapping(target = "autorNombre", source = "autor.nombre")
    TemplateEvaluacionResponse toResponse(TemplateEvaluacion template);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    @Mapping(target = "updatedBy", ignore = true)
    @Mapping(target = "autor", ignore = true)
    @Mapping(target = "scope", ignore = true)
    @Mapping(target = "tipoTrabajoAplicable", ignore = true)
    TemplateEvaluacion toEntity(TemplateEvaluacionRequest request);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    @Mapping(target = "updatedBy", ignore = true)
    @Mapping(target = "autor", ignore = true)
    @Mapping(target = "scope", ignore = true)
    @Mapping(target = "tipoTrabajoAplicable", ignore = true)
    void update(TemplateEvaluacionRequest request, @MappingTarget TemplateEvaluacion target);
}
```

- [ ] **Step 2: Compilar** (genera el impl MapStruct)

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q -o compile`
Expected: BUILD SUCCESS, sin warnings de "Unmapped target property".

- [ ] **Step 3: Commit**

```bash
cd /home/ignacio/Projects/academconnect
git add src/main/java/com/academconnect/mapper/TemplateEvaluacionMapper.java
git commit -m "feat(rubricas): mapper con autor y campos deprecados ignorados"
```

### Task B3: Servicio — autoría, autorización y listado visible (TDD)

**Files:**
- Modify: `academconnect/src/main/java/com/academconnect/service/TemplateEvaluacionService.java`
- Modify: `academconnect/src/test/java/com/academconnect/service/TemplateEvaluacionServiceTests.java`
- Reference: `academconnect/src/main/java/com/academconnect/repository/UsuarioRepository.java` (ya existe; tiene `findById`)

**Diseño de métodos** (el controller resuelve `callerId` por email e `isAdmin` por authority):
- `crear(request, Long autorId)` — set autor, valida, guarda, evento.
- `actualizar(Long id, request, Long callerId, boolean isAdmin)` — autz dueño/admin.
- `desactivar(Long id, Long callerId, boolean isAdmin)` — autz dueño/admin.
- `listarVisibles(Long callerId, boolean isAdmin)` — propias (cualquier visibilidad) + públicas activas de otros; admin todas.
- `buscarVisible(Long id, Long callerId, boolean isAdmin)` — visible o `BusinessException`.

- [ ] **Step 1: Escribir tests de autorización y visibilidad**

Reemplazar el `setup()` y agregar tests. El `templateResponse` usa el nuevo constructor; los mocks incluyen `UsuarioRepository`. Reemplazar las referencias a `TemplateScope`/`TipoTrabajo` por `Visibilidad`.

```java
// imports nuevos
import com.academconnect.domain.Usuario;
import com.academconnect.domain.Visibilidad;
import com.academconnect.repository.UsuarioRepository;
import java.util.List;
import java.util.Optional;

// en la clase: nuevo mock
@Mock
private UsuarioRepository usuarioRepository;

// setup() actualizado:
@BeforeEach
void setup() {
    templateEntity = new TemplateEvaluacion();
    templateEntity.setNombre("Template TCC");
    templateEntity.setVisibilidad(Visibilidad.PRIVADO);

    templateResponse = new TemplateEvaluacionResponse(
            1L, "Template TCC", null, Visibilidad.PRIVADO, 7L, "Autor",
            CRITERIOS_OK, true, new java.math.BigDecimal("6.00"), null, null);

    Mockito.when(mapper.toEntity(Mockito.any())).thenReturn(templateEntity);
    Mockito.when(repository.save(Mockito.any())).thenAnswer(i -> i.getArgument(0));
    Mockito.when(mapper.toResponse(Mockito.any())).thenReturn(templateResponse);
    Mockito.when(usuarioRepository.findById(Mockito.anyLong()))
            .thenReturn(Optional.of(Mockito.mock(Usuario.class)));
}
```

**IMPORTANTE — actualizar los tests existentes en este mismo archivo:**
- `Usuario` es entidad de herencia (dtype); en los tests mockear con `Mockito.mock(Usuario.class)` y stubbear `getId()`.
- Las llamadas existentes a `service.crear(request)` pasan a `service.crear(request, 7L)`; las de `service.actualizar(id, request)` pasan a `service.actualizar(id, request, 7L, false)` (los tests de validación lanzan `BusinessException` en `validar(...)`, antes de tocar el repo/usuario, así que siguen pasando).
- Actualizar el helper `buildRequest(...)` para el nuevo constructor del request: `new TemplateEvaluacionRequest(nombre, descripcion, Visibilidad.PRIVADO, criterios, activo, umbral)`.

```java
@Test
void actualizarShouldThrowWhenCallerIsNotOwnerNorAdmin() {
    var autor = Mockito.mock(Usuario.class);
    Mockito.when(autor.getId()).thenReturn(7L);
    templateEntity.setAutor(autor);
    Mockito.when(repository.findById(1L)).thenReturn(Optional.of(templateEntity));

    Assertions.assertThrows(BusinessException.class,
            () -> service.actualizar(1L, buildRequest(CRITERIOS_OK, new java.math.BigDecimal("6.0")), 99L, false));
}

@Test
void actualizarShouldSucceedWhenCallerIsOwner() {
    var autor = Mockito.mock(Usuario.class);
    Mockito.when(autor.getId()).thenReturn(7L);
    templateEntity.setAutor(autor);
    Mockito.when(repository.findById(1L)).thenReturn(Optional.of(templateEntity));

    Assertions.assertDoesNotThrow(
            () -> service.actualizar(1L, buildRequest(CRITERIOS_OK, new java.math.BigDecimal("6.0")), 7L, false));
}

@Test
void actualizarShouldSucceedWhenCallerIsAdminEvenIfNotOwner() {
    var autor = Mockito.mock(Usuario.class);
    Mockito.when(autor.getId()).thenReturn(7L);
    templateEntity.setAutor(autor);
    Mockito.when(repository.findById(1L)).thenReturn(Optional.of(templateEntity));

    Assertions.assertDoesNotThrow(
            () -> service.actualizar(1L, buildRequest(CRITERIOS_OK, new java.math.BigDecimal("6.0")), 99L, true));
}

@Test
void listarVisiblesShouldReturnOwnAndPublicOfOthersForNonAdmin() {
    var propia = new TemplateEvaluacion();
    var autorPropia = Mockito.mock(Usuario.class);
    Mockito.when(autorPropia.getId()).thenReturn(7L);
    propia.setAutor(autorPropia); propia.setVisibilidad(Visibilidad.PRIVADO); propia.setActivo(true);

    var ajenaPublica = new TemplateEvaluacion();
    var autorAjeno = Mockito.mock(Usuario.class);
    Mockito.when(autorAjeno.getId()).thenReturn(8L);
    ajenaPublica.setAutor(autorAjeno); ajenaPublica.setVisibilidad(Visibilidad.PUBLICO); ajenaPublica.setActivo(true);

    var ajenaPrivada = new TemplateEvaluacion();
    var autorAjeno2 = Mockito.mock(Usuario.class);
    Mockito.when(autorAjeno2.getId()).thenReturn(9L);
    ajenaPrivada.setAutor(autorAjeno2); ajenaPrivada.setVisibilidad(Visibilidad.PRIVADO); ajenaPrivada.setActivo(true);

    Mockito.when(repository.findAll()).thenReturn(List.of(propia, ajenaPublica, ajenaPrivada));

    var res = service.listarVisibles(7L, false);
    Assertions.assertEquals(2, res.size()); // propia + ajena pública, NO la ajena privada
}
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q -o test -Dtest=TemplateEvaluacionServiceTests`
Expected: FAIL (métodos `listarVisibles`/`actualizar(...,callerId,isAdmin)` no existen; constructor del response cambió).

- [ ] **Step 3: Implementar en el servicio**

Inyectar `UsuarioRepository`; reemplazar firmas. Reemplazar el uso de `scope` en el evento por `visibilidad`.

```java
// agregar al constructor (campo final):
private final UsuarioRepository usuarioRepository;

@Transactional
public TemplateEvaluacionResponse crear(TemplateEvaluacionRequest request, Long autorId) {
    validar(request);
    var template = mapper.toEntity(request);
    var autor = usuarioRepository.findById(autorId)
            .orElseThrow(() -> new ResourceNotFoundException("Usuario", autorId));
    template.setAutor(autor);
    if (template.getVisibilidad() == null) template.setVisibilidad(com.academconnect.domain.Visibilidad.PRIVADO);
    var saved = repository.save(template);
    events.publishEvent(ActividadEvent.of(
            TipoActividad.TEMPLATE_CREADO,
            autorId,
            "TEMPLATE_EVALUACION", saved.getId(),
            Map.of("nombre", saved.getNombre(),
                   "visibilidad", saved.getVisibilidad().name()),
            VisibilidadActividad.PUBLICA,
            List.of()));
    return mapper.toResponse(saved);
}

@Transactional
public TemplateEvaluacionResponse actualizar(Long id, TemplateEvaluacionRequest request, Long callerId, boolean isAdmin) {
    var template = repository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("TemplateEvaluacion", id));
    exigirPropietarioOAdmin(template, callerId, isAdmin);
    validar(request);
    mapper.update(request, template);
    return mapper.toResponse(repository.save(template));
}

@Transactional
public void desactivar(Long id, Long callerId, boolean isAdmin) {
    var template = repository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("TemplateEvaluacion", id));
    exigirPropietarioOAdmin(template, callerId, isAdmin);
    template.setActivo(false);
    repository.save(template);
}

public List<TemplateEvaluacionResponse> listarVisibles(Long callerId, boolean isAdmin) {
    return repository.findAll().stream()
            .filter(t -> isAdmin || esVisiblePara(t, callerId))
            .map(mapper::toResponse)
            .toList();
}

public TemplateEvaluacionResponse buscarVisible(Long id, Long callerId, boolean isAdmin) {
    var t = repository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("TemplateEvaluacion", id));
    if (!isAdmin && !esVisiblePara(t, callerId)) {
        throw new BusinessException("No tenés acceso a esta rúbrica");
    }
    return mapper.toResponse(t);
}

private boolean esPropietario(TemplateEvaluacion t, Long callerId) {
    return t.getAutor() != null && t.getAutor().getId().equals(callerId);
}

private boolean esVisiblePara(TemplateEvaluacion t, Long callerId) {
    return esPropietario(t, callerId)
            || (t.getVisibilidad() == com.academconnect.domain.Visibilidad.PUBLICO && t.isActivo());
}

private void exigirPropietarioOAdmin(TemplateEvaluacion t, Long callerId, boolean isAdmin) {
    if (!isAdmin && !esPropietario(t, callerId)) {
        throw new BusinessException("Solo el autor o un administrador puede modificar esta rúbrica");
    }
}
```

Borrar los viejos `crear(request)`/`actualizar(id,request)`/`desactivar(id)` de una sola firma (reemplazados arriba). Mantener `validar(...)` sin cambios.

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q -o test -Dtest=TemplateEvaluacionServiceTests`
Expected: PASS (todos, incluidos los de validación preexistentes que se actualizaron al nuevo `buildRequest`).

Nota: en el helper `buildRequest(...)` del test, actualizar el constructor del request a `(nombre, descripcion, Visibilidad.PRIVADO, criterios, activo, umbral)`.

- [ ] **Step 5: Commit**

```bash
cd /home/ignacio/Projects/academconnect
git add src/main/java/com/academconnect/service/TemplateEvaluacionService.java src/test/java/com/academconnect/service/TemplateEvaluacionServiceTests.java
git commit -m "feat(rubricas): autoría, autorización por propiedad y listado visible"
```

### Task B4: Controller — roles y resolución de caller

**Files:**
- Modify: `academconnect/src/main/java/com/academconnect/controller/TemplateEvaluacionController.java`

- [ ] **Step 1: Reescribir el controller**

```java
package com.academconnect.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.academconnect.dto.TemplateEvaluacionRequest;
import com.academconnect.dto.TemplateEvaluacionResponse;
import com.academconnect.exception.ResourceNotFoundException;
import com.academconnect.repository.UsuarioRepository;
import com.academconnect.service.TemplateEvaluacionService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/templates")
@RequiredArgsConstructor
public class TemplateEvaluacionController {

    private final TemplateEvaluacionService service;
    private final UsuarioRepository usuarioRepository;

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<TemplateEvaluacionResponse> listar(Authentication authn) {
        return service.listarVisibles(callerId(authn), isAdmin(authn));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public TemplateEvaluacionResponse buscarPorId(@PathVariable Long id, Authentication authn) {
        return service.buscarVisible(id, callerId(authn), isAdmin(authn));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('PROFESOR','EXTERNO','ADMINISTRADOR')")
    public TemplateEvaluacionResponse crear(@Valid @RequestBody TemplateEvaluacionRequest request, Authentication authn) {
        return service.crear(request, callerId(authn));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public TemplateEvaluacionResponse actualizar(
            @PathVariable Long id,
            @Valid @RequestBody TemplateEvaluacionRequest request,
            Authentication authn) {
        return service.actualizar(id, request, callerId(authn), isAdmin(authn));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("isAuthenticated()")
    public void desactivar(@PathVariable Long id, Authentication authn) {
        service.desactivar(id, callerId(authn), isAdmin(authn));
    }

    private Long callerId(Authentication authn) {
        return usuarioRepository.findByEmail(authn.getName())
                .orElseThrow(() -> new ResourceNotFoundException("Usuario con email", authn.getName()))
                .getId();
    }

    private boolean isAdmin(Authentication authn) {
        return authn.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMINISTRADOR"));
    }
}
```

- [ ] **Step 2: Compilar + correr toda la suite backend** (detectar usos rotos de scope/tipo en otras clases)

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q -o test`
Expected: BUILD SUCCESS. Si algún test/clase referencia `template.getScope()`/`getTipoTrabajoAplicable()` o el response viejo (p. ej. `TemplateEvaluacionJsonbTests`, `AsignacionService`), corregirlo en este task (los campos siguen existiendo en el dominio; solo dejaron de ser obligatorios/expuestos).

- [ ] **Step 3: Commit**

```bash
cd /home/ignacio/Projects/academconnect
git add -A
git commit -m "feat(rubricas): controller con roles abiertos y autorización por caller"
```

---

## FASE C — Frontend: modelos y servicio

### Task C1: Modelos

**Files:**
- Create: `academconnect-web/src/app/features/rubricas/rubricas.models.ts`

- [ ] **Step 1: Escribir los modelos** (reusa `Criterio`/`CriterioTipo` de evaluaciones)

```ts
import type { Criterio } from '../evaluaciones/evaluaciones.models';

export type Visibilidad = 'PUBLICO' | 'PRIVADO';

export interface Rubrica {
  id: number;
  nombre: string;
  descripcion: string;
  visibilidad: Visibilidad;
  autorId: number | null;
  autorNombre: string | null;
  criterios: Criterio[];
  umbralAprobacion: number;
  activo: boolean;
}

/** Lo que devuelve el backend: `criterios` es JSON crudo. */
export interface RubricaResponse {
  id: number;
  nombre: string;
  descripcion: string | null;
  visibilidad: Visibilidad;
  autorId: number | null;
  autorNombre: string | null;
  criterios: string;
  activo: boolean;
  umbralAprobacion: number;
}

export interface RubricaRequest {
  nombre: string;
  descripcion: string;
  visibilidad: Visibilidad;
  criterios: string; // JSON serializado
  activo: boolean;
  umbralAprobacion: number;
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/ignacio/Projects/academconnect-web
git add src/app/features/rubricas/rubricas.models.ts
git commit -m "feat(rubricas): modelos del frontend"
```

### Task C2: Servicio (TDD)

**Files:**
- Create: `academconnect-web/src/app/features/rubricas/rubricas.service.ts`
- Test: `academconnect-web/src/app/features/rubricas/rubricas.service.spec.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RubricasService } from './rubricas.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('RubricasService', () => {
  let service: RubricasService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RubricasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('listar parsea criterios de cada rúbrica', () => {
    let result: number[] = [];
    service.listar().subscribe((rs) => (result = rs.map((r) => r.criterios.length)));
    const req = http.expectOne(`${api}/api/templates`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 1, nombre: 'R', descripcion: null, visibilidad: 'PUBLICO', autorId: 7, autorNombre: 'A',
        criterios: '[{"codigo":"c1","nombre":"X","tipo":"ESCALA","peso":1,"escalaMin":0,"escalaMax":10}]',
        activo: true, umbralAprobacion: 6,
      },
    ]);
    expect(result).toEqual([1]);
  });

  it('crear postea el request tal cual', () => {
    const reqBody = {
      nombre: 'R', descripcion: '', visibilidad: 'PRIVADO' as const,
      criterios: '[]', activo: true, umbralAprobacion: 6,
    };
    service.crear(reqBody).subscribe();
    const req = http.expectOne(`${api}/api/templates`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(reqBody);
    req.flush({ ...reqBody, id: 1, autorId: 7, autorNombre: 'A', descripcion: null });
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --no-watch --include='**/rubricas.service.spec.ts'`
Expected: FAIL (no existe `RubricasService`).

- [ ] **Step 3: Implementar el servicio**

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '@env/environment';
import type { Criterio } from '../evaluaciones/evaluaciones.models';
import type { Rubrica, RubricaRequest, RubricaResponse } from './rubricas.models';

@Injectable({ providedIn: 'root' })
export class RubricasService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  listar(): Observable<Rubrica[]> {
    return this.http
      .get<RubricaResponse[]>(`${this.api}/api/templates`)
      .pipe(map((rs) => rs.map((r) => this.toRubrica(r))));
  }

  obtener(id: number): Observable<Rubrica> {
    return this.http
      .get<RubricaResponse>(`${this.api}/api/templates/${id}`)
      .pipe(map((r) => this.toRubrica(r)));
  }

  crear(req: RubricaRequest): Observable<RubricaResponse> {
    return this.http.post<RubricaResponse>(`${this.api}/api/templates`, req);
  }

  actualizar(id: number, req: RubricaRequest): Observable<RubricaResponse> {
    return this.http.put<RubricaResponse>(`${this.api}/api/templates/${id}`, req);
  }

  desactivar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/api/templates/${id}`);
  }

  private toRubrica(r: RubricaResponse): Rubrica {
    let criterios: Criterio[] = [];
    try {
      const parsed = JSON.parse(r.criterios);
      if (Array.isArray(parsed)) criterios = parsed as Criterio[];
    } catch {
      criterios = [];
    }
    return {
      id: r.id,
      nombre: r.nombre,
      descripcion: r.descripcion ?? '',
      visibilidad: r.visibilidad,
      autorId: r.autorId,
      autorNombre: r.autorNombre,
      criterios,
      umbralAprobacion: r.umbralAprobacion,
      activo: r.activo,
    };
  }
}
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --no-watch --include='**/rubricas.service.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/ignacio/Projects/academconnect-web
git add src/app/features/rubricas/rubricas.service.ts src/app/features/rubricas/rubricas.service.spec.ts
git commit -m "feat(rubricas): servicio HTTP del frontend"
```

---

## FASE D — Frontend: lógica pura del builder (TDD)

### Task D1: Funciones puras (`rubrica-builder.builder.ts`)

**Files:**
- Create: `academconnect-web/src/app/features/rubricas/rubrica-builder.builder.ts`
- Test: `academconnect-web/src/app/features/rubricas/rubrica-builder.builder.spec.ts`

**Tipos del formulario:**
```ts
export interface CriterioDraft {
  nombre: string;
  tipo: CriterioTipo;
  peso: number;        // 0..1 (0 si TEXTO)
  opciones: string[];  // solo SELECCION
}
export interface RubricaDraft {
  nombre: string;
  descripcion: string;
  visibilidad: Visibilidad;
  escalaMin: number;
  escalaMax: number;
  umbralAprobacion: number;
  criterios: CriterioDraft[];
}
```

- [ ] **Step 1: Escribir los tests**

```ts
import {
  slugify, sumaPesos, distribuirEquitativamente, validarRubrica, toRubricaRequest,
} from './rubrica-builder.builder';
import type { RubricaDraft } from './rubrica-builder.builder';

function draft(over: Partial<RubricaDraft> = {}): RubricaDraft {
  return {
    nombre: 'Mi rúbrica', descripcion: '', visibilidad: 'PRIVADO',
    escalaMin: 0, escalaMax: 10, umbralAprobacion: 6,
    criterios: [
      { nombre: 'Metodología', tipo: 'ESCALA', peso: 0.5, opciones: [] },
      { nombre: 'Originalidad', tipo: 'SLIDER', peso: 0.5, opciones: [] },
    ],
    ...over,
  };
}

describe('rubrica-builder.builder', () => {
  it('slugify normaliza acentos, espacios y mayúsculas', () => {
    expect(slugify('Claridad de Escritura')).toBe('claridad-de-escritura');
    expect(slugify('Metodología')).toBe('metodologia');
  });

  it('sumaPesos ignora TEXTO', () => {
    const d = draft({ criterios: [
      { nombre: 'A', tipo: 'ESCALA', peso: 0.7, opciones: [] },
      { nombre: 'Notas', tipo: 'TEXTO', peso: 0, opciones: [] },
    ]});
    expect(sumaPesos(d.criterios)).toBeCloseTo(0.7, 5);
  });

  it('distribuirEquitativamente reparte 1.0 entre ponderables', () => {
    const pesos = distribuirEquitativamente([
      { nombre: 'A', tipo: 'ESCALA', peso: 0, opciones: [] },
      { nombre: 'B', tipo: 'SLIDER', peso: 0, opciones: [] },
      { nombre: 'N', tipo: 'TEXTO', peso: 0, opciones: [] },
    ]);
    expect(pesos).toEqual([0.5, 0.5, 0]);
  });

  it('validarRubrica detecta pesos que no suman 1, SELECCION sin opciones y umbral fuera de rango', () => {
    expect(validarRubrica(draft())).toEqual([]); // válida

    const malPeso = draft({ criterios: [
      { nombre: 'A', tipo: 'ESCALA', peso: 0.3, opciones: [] },
      { nombre: 'B', tipo: 'SLIDER', peso: 0.3, opciones: [] },
    ]});
    expect(validarRubrica(malPeso).some((e) => e.includes('pesos'))).toBe(true);

    const selSinOpciones = draft({ criterios: [
      { nombre: 'Nivel', tipo: 'SELECCION', peso: 1, opciones: [] },
    ]});
    expect(validarRubrica(selSinOpciones).some((e) => e.includes('opciones'))).toBe(true);

    const umbralFuera = draft({ umbralAprobacion: 20 });
    expect(validarRubrica(umbralFuera).some((e) => e.includes('umbral'))).toBe(true);
  });

  it('toRubricaRequest serializa criterios con codigo slug y escala uniforme', () => {
    const req = toRubricaRequest(draft());
    const criterios = JSON.parse(req.criterios);
    expect(criterios[0]).toEqual({
      codigo: 'metodologia', nombre: 'Metodología', tipo: 'ESCALA',
      peso: 0.5, escalaMin: 0, escalaMax: 10,
    });
    expect(req.visibilidad).toBe('PRIVADO');
    expect(req.umbralAprobacion).toBe(6);
  });

  it('toRubricaRequest incluye opciones solo en SELECCION y peso 0 en TEXTO', () => {
    const req = toRubricaRequest(draft({ criterios: [
      { nombre: 'Nivel', tipo: 'SELECCION', peso: 1, opciones: ['Bajo', 'Alto'] },
      { nombre: 'Notas', tipo: 'TEXTO', peso: 0, opciones: [] },
    ]}));
    const criterios = JSON.parse(req.criterios);
    expect(criterios[0].opciones).toEqual(['Bajo', 'Alto']);
    expect(criterios[1].peso).toBe(0);
    expect(criterios[1].opciones).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --no-watch --include='**/rubrica-builder.builder.spec.ts'`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
import type { Criterio, CriterioTipo } from '../evaluaciones/evaluaciones.models';
import type { RubricaRequest, Visibilidad } from './rubricas.models';

export interface CriterioDraft {
  nombre: string;
  tipo: CriterioTipo;
  peso: number;
  opciones: string[];
}

export interface RubricaDraft {
  nombre: string;
  descripcion: string;
  visibilidad: Visibilidad;
  escalaMin: number;
  escalaMax: number;
  umbralAprobacion: number;
  criterios: CriterioDraft[];
}

const PONDERABLE = (c: CriterioDraft): boolean => c.tipo !== 'TEXTO';

export function slugify(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function sumaPesos(criterios: CriterioDraft[]): number {
  return criterios.filter(PONDERABLE).reduce((t, c) => t + (c.peso || 0), 0);
}

export function distribuirEquitativamente(criterios: CriterioDraft[]): number[] {
  const ponderables = criterios.filter(PONDERABLE).length;
  const cada = ponderables > 0 ? 1 / ponderables : 0;
  return criterios.map((c) => (PONDERABLE(c) ? cada : 0));
}

export function validarRubrica(d: RubricaDraft): string[] {
  const errores: string[] = [];
  if (!d.nombre.trim()) errores.push('El nombre es obligatorio');
  if (d.escalaMin >= d.escalaMax) errores.push('La escala mínima debe ser menor que la máxima');
  if (d.criterios.length === 0) errores.push('Agregá al menos un criterio');

  for (const c of d.criterios) {
    if (!c.nombre.trim()) errores.push('Cada criterio necesita un nombre');
    if (c.tipo === 'SELECCION' && c.opciones.filter((o) => o.trim()).length === 0) {
      errores.push(`El criterio "${c.nombre}" (SELECCIÓN) necesita opciones`);
    }
  }

  const suma = sumaPesos(d.criterios);
  if (d.criterios.some(PONDERABLE) && Math.abs(suma - 1) > 0.001) {
    errores.push(`Los pesos deben sumar 100% (actual: ${Math.round(suma * 100)}%)`);
  }
  if (d.umbralAprobacion < d.escalaMin || d.umbralAprobacion > d.escalaMax) {
    errores.push(`El umbral debe estar entre ${d.escalaMin} y ${d.escalaMax}`);
  }
  return errores;
}

export function toRubricaRequest(d: RubricaDraft): RubricaRequest {
  const criterios: Criterio[] = d.criterios.map((c) => {
    const base: Criterio = {
      codigo: slugify(c.nombre),
      nombre: c.nombre,
      tipo: c.tipo,
      peso: c.tipo === 'TEXTO' ? 0 : c.peso,
      escalaMin: d.escalaMin,
      escalaMax: d.escalaMax,
    };
    if (c.tipo === 'SELECCION') base.opciones = c.opciones.filter((o) => o.trim());
    return base;
  });
  return {
    nombre: d.nombre.trim(),
    descripcion: d.descripcion.trim(),
    visibilidad: d.visibilidad,
    criterios: JSON.stringify(criterios),
    activo: true,
    umbralAprobacion: d.umbralAprobacion,
  };
}
```

- [ ] **Step 4: Correr para verlo pasar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --no-watch --include='**/rubrica-builder.builder.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/ignacio/Projects/academconnect-web
git add src/app/features/rubricas/rubrica-builder.builder.ts src/app/features/rubricas/rubrica-builder.builder.spec.ts
git commit -m "feat(rubricas): lógica pura del builder (slug, pesos, validación, request)"
```

---

## FASE E — Frontend: páginas, rutas y navegación

### Task E1: Página de listado (`/rubricas`)

**Files:**
- Create: `academconnect-web/src/app/features/rubricas/lista-page/lista-page.ts` (template + estilos inline o externos)
- Test: `academconnect-web/src/app/features/rubricas/lista-page/lista-page.spec.ts`

- [ ] **Step 1: Test del componente** (tabs Mías/Públicas a partir de `autorId` del usuario actual)

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ListaPage } from './lista-page';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('ListaPage (rubricas)', () => {
  function create() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: { currentUser: () => ({ userId: 7, rol: 'PROFESOR' }) } },
      ],
    });
    const fixture = TestBed.createComponent(ListaPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  }

  it('separa mías y públicas según el autor', () => {
    const { fixture, http } = create();
    http.expectOne(`${api}/api/templates`).flush([
      { id: 1, nombre: 'Mía', descripcion: null, visibilidad: 'PRIVADO', autorId: 7, autorNombre: 'Yo', criterios: '[]', activo: true, umbralAprobacion: 6 },
      { id: 2, nombre: 'Ajena pública', descripcion: null, visibilidad: 'PUBLICO', autorId: 8, autorNombre: 'Otro', criterios: '[]', activo: true, umbralAprobacion: 6 },
    ]);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp['mias']().length).toBe(1);
    expect(cmp['publicas']().length).toBe(1);
    http.verify();
  });
});
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --no-watch --include='**/lista-page.spec.ts'`
Expected: FAIL (no existe `ListaPage`).

- [ ] **Step 3: Implementar la página** (signals + computed; tabs; cards; acciones)

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';

import { AuthService } from '@core/auth/auth.service';
import { RubricasService } from '../rubricas.service';
import type { Rubrica } from '../rubricas.models';

@Component({
  selector: 'ac-rubricas-lista',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe],
  template: `
    <section class="lista">
      <header class="lista__head">
        <h1 class="t-h2">Rúbricas</h1>
        <a class="lista__nueva" routerLink="/rubricas/nueva">Nueva rúbrica</a>
      </header>

      <div class="lista__tabs" role="tablist">
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'mias'"
                class="lista__tab" [class.lista__tab--on]="tab() === 'mias'" (click)="tab.set('mias')">
          Mías ({{ mias().length }})
        </button>
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'publicas'"
                class="lista__tab" [class.lista__tab--on]="tab() === 'publicas'" (click)="tab.set('publicas')">
          Públicas ({{ publicas().length }})
        </button>
      </div>

      @if (loading()) {
        <p>Cargando…</p>
      } @else {
        @let visibles = tab() === 'mias' ? mias() : publicas();
        @if (visibles.length === 0) {
          <p class="lista__vacio">No hay rúbricas en esta vista.</p>
        }
        <ul class="lista__grid">
          @for (r of visibles; track r.id) {
            <li class="rubcard" [class.rubcard--inactiva]="!r.activo">
              <div class="rubcard__top">
                <span class="rubcard__nombre">{{ r.nombre }}</span>
                <span class="rubcard__vis">{{ r.visibilidad === 'PUBLICO' ? 'Pública' : 'Privada' }}</span>
              </div>
              <p class="rubcard__meta">
                {{ r.criterios.length }} criterios · umbral {{ r.umbralAprobacion | number: '1.0-2' }}
                @if (r.autorNombre) { · {{ r.autorNombre }} }
              </p>
              <div class="rubcard__acciones">
                @if (esMia(r)) {
                  <a [routerLink]="['/rubricas', r.id, 'editar']">Editar</a>
                  <button type="button" (click)="desactivar(r)">Desactivar</button>
                } @else {
                  <a [routerLink]="['/rubricas', r.id, 'editar']">Ver</a>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    .lista { max-width: 960px; margin: 0 auto; padding: var(--sp-5) var(--sp-4) var(--sp-7); }
    .lista__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-4); }
    .lista__nueva { background: var(--c-primary); color: var(--c-text-on-primary); padding: var(--sp-2) var(--sp-4); border-radius: var(--r-md); text-decoration: none; }
    .lista__tabs { display: flex; gap: var(--sp-2); margin-bottom: var(--sp-4); border-bottom: 1px solid var(--c-border); }
    .lista__tab { background: none; border: none; padding: var(--sp-2) var(--sp-3); cursor: pointer; color: var(--c-text-muted); border-bottom: 2px solid transparent; }
    .lista__tab--on { color: var(--c-text); border-bottom-color: var(--c-accent); font-weight: var(--fw-semibold); }
    .lista__grid { list-style: none; padding: 0; display: grid; gap: var(--sp-3); grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
    .rubcard { border: 1px solid var(--c-border); border-radius: var(--r-md); padding: var(--sp-4); background: var(--c-surface); display: grid; gap: var(--sp-2); }
    .rubcard--inactiva { opacity: 0.6; }
    .rubcard__top { display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-2); }
    .rubcard__nombre { font-weight: var(--fw-semibold); }
    .rubcard__vis { font-family: var(--ff-mono); font-size: var(--fs-caption); color: var(--c-accent); background: var(--c-accent-soft); border-radius: var(--r-sm); padding: 2px var(--sp-2); }
    .rubcard__meta { margin: 0; font-size: var(--fs-body-sm); color: var(--c-text-muted); }
    .rubcard__acciones { display: flex; gap: var(--sp-3); font-size: var(--fs-body-sm); }
    .rubcard__acciones button { background: none; border: none; color: var(--c-state-rechazado); cursor: pointer; padding: 0; }
  `],
})
export class ListaPage {
  private readonly service = inject(RubricasService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tab = signal<'mias' | 'publicas'>('mias');
  protected readonly loading = signal(true);
  private readonly rubricas = signal<Rubrica[]>([]);

  protected readonly mias = computed(() => this.rubricas().filter((r) => this.esMia(r)));
  protected readonly publicas = computed(() => this.rubricas().filter((r) => !this.esMia(r)));

  constructor() {
    this.cargar();
  }

  protected esMia(r: Rubrica): boolean {
    return r.autorId === this.auth.currentUser()?.userId;
  }

  private cargar(): void {
    this.loading.set(true);
    this.service.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (rs) => { this.rubricas.set(rs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  protected desactivar(r: Rubrica): void {
    this.service.desactivar(r.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.cargar(),
    });
  }
}
```

- [ ] **Step 4: Correr para verlo pasar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --no-watch --include='**/lista-page.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/ignacio/Projects/academconnect-web
git add src/app/features/rubricas/lista-page/
git commit -m "feat(rubricas): página de listado (Mías/Públicas)"
```

### Task E2: Builder de dos paneles con preview en vivo

**Files:**
- Create: `academconnect-web/src/app/features/rubricas/builder-page/builder-page.ts`
- Create: `academconnect-web/src/app/features/rubricas/builder-page/builder-page.html`
- Create: `academconnect-web/src/app/features/rubricas/builder-page/builder-page.scss`
- Test: `academconnect-web/src/app/features/rubricas/builder-page/builder-page.spec.ts`

**Diseño del componente:**
- Form reactivo tipado con `FormArray` de criterios. Un `signal<RubricaDraft>` derivado del form (vía `valueChanges` + `takeUntilDestroyed`) alimenta:
  - el total de pesos (`sumaPesos`) y la validación (`validarRubrica`),
  - la **preview**: construye, con `buildEvaluacionForm` (de evaluaciones) a partir de `toRubricaRequest(...) → parseSnapshot`, un form de evaluación deshabilitado y renderiza `criterio-field` (modo editable, deshabilitado) + el anillo de proyección.
- `ImplementaConfirmaSalida` (canDeactivate) reusando `unsavedGuard` si el form está dirty.
- Modo edición: si hay `:id`, carga la rúbrica con `service.obtener(id)` y rellena el form; si no es del usuario (no dueño) y no es admin, el form va `disable()` (solo ver).

- [ ] **Step 1: Test del componente** (agregar criterio, total de pesos, bloqueo de guardado inválido)

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { BuilderPage } from './builder-page';
import { AuthService } from '@core/auth/auth.service';

describe('BuilderPage (rubricas)', () => {
  function create() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: { currentUser: () => ({ userId: 7, rol: 'PROFESOR' }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map() } } },
      ],
    });
    const fixture = TestBed.createComponent(BuilderPage);
    fixture.detectChanges();
    return fixture;
  }

  it('arranca con un criterio y el total de pesos en 100% al distribuir', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp['agregarCriterio']();
    cmp['distribuir']();
    fixture.detectChanges();
    expect(Math.round(cmp['totalPesos']() * 100)).toBe(100);
  });

  it('no permite guardar si la rúbrica es inválida (pesos ≠ 100%)', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    // un solo criterio con peso 0.5 → suma 50% → inválida
    cmp['form'].controls.criterios.at(0).controls.peso.setValue(0.5);
    fixture.detectChanges();
    expect(cmp['errores']().length).toBeGreaterThan(0);
    expect(cmp['puedeGuardar']()).toBe(false);
  });
});
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --no-watch --include='**/builder-page.spec.ts'`
Expected: FAIL (no existe `BuilderPage`).

- [ ] **Step 3: Implementar el componente (TS)**

```ts
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray, FormControl, FormGroup, ReactiveFormsModule,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';

import { AuthService } from '@core/auth/auth.service';
import { RubricasService } from '../rubricas.service';
import {
  sumaPesos, distribuirEquitativamente, validarRubrica, toRubricaRequest,
  type RubricaDraft, type CriterioDraft,
} from '../rubrica-builder.builder';
import { CriterioField } from '../../evaluaciones/components/criterio-field/criterio-field';
import { buildEvaluacionForm, proyeccionMax } from '../../evaluaciones/evaluacion-form.builder';
import type { Criterio, CriterioTipo, TemplateSnapshot } from '../../evaluaciones/evaluaciones.models';
import type { ConfirmaSalida } from '../../evaluaciones/unsaved.guard';

type CriterioForm = FormGroup<{
  nombre: FormControl<string>;
  tipo: FormControl<CriterioTipo>;
  peso: FormControl<number>;
  opciones: FormControl<string>; // CSV editable; se separa al construir el draft
}>;

@Component({
  selector: 'ac-rubricas-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, CriterioField],
  templateUrl: './builder-page.html',
  styleUrl: './builder-page.scss',
})
export class BuilderPage implements ConfirmaSalida {
  private readonly service = inject(RubricasService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly TIPOS: CriterioTipo[] = ['ESCALA', 'SLIDER', 'SELECCION', 'BOOLEANO', 'TEXTO'];

  protected readonly form = new FormGroup({
    nombre: new FormControl('', { nonNullable: true }),
    descripcion: new FormControl('', { nonNullable: true }),
    visibilidad: new FormControl<'PUBLICO' | 'PRIVADO'>('PRIVADO', { nonNullable: true }),
    escalaMin: new FormControl(0, { nonNullable: true }),
    escalaMax: new FormControl(10, { nonNullable: true }),
    umbralAprobacion: new FormControl(6, { nonNullable: true }),
    criterios: new FormArray<CriterioForm>([]),
  });

  private readonly draft = signal<RubricaDraft>(this.toDraft());
  protected readonly errores = computed(() => validarRubrica(this.draft()));
  protected readonly totalPesos = computed(() => sumaPesos(this.draft().criterios));
  protected readonly puedeGuardar = computed(() => this.errores().length === 0);
  protected readonly enviando = signal(false);
  protected readonly soloLectura = signal(false);

  // ---- Vista previa en vivo: snapshot + form de evaluación deshabilitado ----
  protected readonly previewSnapshot = computed<TemplateSnapshot>(() => ({
    criterios: JSON.parse(toRubricaRequest(this.draft()).criterios) as Criterio[],
    umbralAprobacion: this.draft().umbralAprobacion,
  }));
  protected readonly previewEval = computed(() => {
    const f = buildEvaluacionForm(this.previewSnapshot());
    f.disable();
    return f;
  });
  protected readonly previewMax = computed(() => proyeccionMax(this.previewSnapshot()));

  private editId: number | null = null;

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (this.form.controls.criterios.length === 0) this.agregarCriterio();
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.draft.set(this.toDraft()));
    this.draft.set(this.toDraft());

    if (idParam) {
      this.editId = Number(idParam);
      this.service.obtener(this.editId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (r) => {
          this.form.controls.criterios.clear();
          this.form.patchValue({
            nombre: r.nombre, descripcion: r.descripcion, visibilidad: r.visibilidad,
            escalaMin: r.criterios[0]?.escalaMin ?? 0, escalaMax: r.criterios[0]?.escalaMax ?? 10,
            umbralAprobacion: r.umbralAprobacion,
          });
          r.criterios.forEach((c) => this.form.controls.criterios.push(this.nuevoCriterio({
            nombre: c.nombre, tipo: c.tipo, peso: c.peso, opciones: (c.opciones ?? []).join(', '),
          })));
          const esMio = r.autorId === this.auth.currentUser()?.userId;
          const esAdmin = this.auth.currentUser()?.rol === 'ADMINISTRADOR';
          if (!esMio && !esAdmin) { this.form.disable(); this.soloLectura.set(true); }
          this.draft.set(this.toDraft());
        },
      });
    }
  }

  private nuevoCriterio(init?: Partial<{ nombre: string; tipo: CriterioTipo; peso: number; opciones: string }>): CriterioForm {
    return new FormGroup({
      nombre: new FormControl(init?.nombre ?? '', { nonNullable: true }),
      tipo: new FormControl<CriterioTipo>(init?.tipo ?? 'ESCALA', { nonNullable: true }),
      peso: new FormControl(init?.peso ?? 0, { nonNullable: true }),
      opciones: new FormControl(init?.opciones ?? '', { nonNullable: true }),
    });
  }

  protected agregarCriterio(): void {
    this.form.controls.criterios.push(this.nuevoCriterio());
  }

  protected quitarCriterio(i: number): void {
    this.form.controls.criterios.removeAt(i);
  }

  protected distribuir(): void {
    const pesos = distribuirEquitativamente(this.toDraft().criterios);
    this.form.controls.criterios.controls.forEach((g, i) => g.controls.peso.setValue(pesos[i]));
  }

  private toDraft(): RubricaDraft {
    const v = this.form.getRawValue();
    const criterios: CriterioDraft[] = v.criterios.map((c) => ({
      nombre: c.nombre,
      tipo: c.tipo,
      peso: c.tipo === 'TEXTO' ? 0 : c.peso,
      opciones: c.opciones.split(',').map((o) => o.trim()).filter(Boolean),
    }));
    return {
      nombre: v.nombre, descripcion: v.descripcion, visibilidad: v.visibilidad,
      escalaMin: v.escalaMin, escalaMax: v.escalaMax, umbralAprobacion: v.umbralAprobacion,
      criterios,
    };
  }

  protected guardar(): void {
    if (!this.puedeGuardar()) return;
    this.enviando.set(true);
    const req = toRubricaRequest(this.draft());
    const obs = this.editId
      ? this.service.actualizar(this.editId, req)
      : this.service.crear(req);
    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.form.markAsPristine(); this.router.navigate(['/rubricas']); },
      error: () => this.enviando.set(false),
    });
  }

  canDeactivate(): boolean {
    return this.soloLectura() || !this.form.dirty || this.enviando();
  }
}
```

- [ ] **Step 4: Implementar template (HTML)** — dos paneles

```html
<div class="builder">
  <section class="builder__form">
    <h1 class="t-h2">{{ soloLectura() ? 'Rúbrica' : 'Editor de rúbrica' }}</h1>

    <form [formGroup]="form" (ngSubmit)="guardar()">
      <label class="campo">Nombre
        <input formControlName="nombre" type="text" />
      </label>
      <label class="campo">Descripción
        <textarea formControlName="descripcion" rows="2"></textarea>
      </label>

      <div class="campo-fila">
        <label class="campo">Visibilidad
          <select formControlName="visibilidad">
            <option value="PRIVADO">Privada</option>
            <option value="PUBLICO">Pública</option>
          </select>
        </label>
        <label class="campo">Escala mín
          <input formControlName="escalaMin" type="number" />
        </label>
        <label class="campo">Escala máx
          <input formControlName="escalaMax" type="number" />
        </label>
        <label class="campo">Umbral
          <input formControlName="umbralAprobacion" type="number" />
        </label>
      </div>

      <div class="criterios-head">
        <span class="t-overline">Criterios</span>
        <span class="total" [class.total--ok]="puedeGuardar()">
          Pesos {{ totalPesos() * 100 | number: '1.0-0' }}%
        </span>
        @if (!soloLectura()) { <button type="button" (click)="distribuir()">Distribuir</button> }
      </div>

      <div formArrayName="criterios" class="criterios">
        @for (g of form.controls.criterios.controls; track $index; let i = $index) {
          <fieldset class="criterio-edit" [formGroupName]="i">
            <input formControlName="nombre" placeholder="Nombre del criterio" />
            <select formControlName="tipo">
              @for (t of TIPOS; track t) { <option [value]="t">{{ t }}</option> }
            </select>
            @if (g.controls.tipo.value !== 'TEXTO') {
              <input formControlName="peso" type="number" step="0.05" min="0" max="1" placeholder="peso" />
            }
            @if (g.controls.tipo.value === 'SELECCION') {
              <input formControlName="opciones" placeholder="opciones separadas por coma" />
            }
            @if (!soloLectura()) { <button type="button" (click)="quitarCriterio(i)" aria-label="Quitar criterio">✕</button> }
          </fieldset>
        }
      </div>

      @if (!soloLectura()) {
        <button type="button" class="agregar" (click)="agregarCriterio()">+ Agregar criterio</button>
      }

      @if (errores().length) {
        <ul class="errores">
          @for (e of errores(); track e) { <li>{{ e }}</li> }
        </ul>
      }

      @if (!soloLectura()) {
        <button type="submit" class="guardar" [disabled]="!puedeGuardar() || enviando()">Guardar rúbrica</button>
      }
    </form>
  </section>

  <aside class="builder__preview" aria-label="Vista previa de la rúbrica">
    <p class="t-overline">Vista previa (como la ve el evaluador)</p>
    <div class="preview-proy">Proyección máx {{ previewMax() | number: '1.0-2' }}</div>
    @for (c of previewSnapshot().criterios; track c.codigo; let i = $index) {
      <ac-criterio-field
        [criterio]="c"
        [group]="$any(previewEval().controls.criterios.at(i))"
        [indice]="i + 1"
        [readonly]="false" />
    }
  </aside>
</div>
```

Notas de la preview:
- `criterio-field` trae su propio `[formGroup]`, así que **no** hace falta envolver en `formArrayName`.
- `previewEval()` está `disable()`-ado: los controles tipados se ven pero no son interactivos.
- `previewSnapshot()` y `previewEval()` se recalculan juntos a partir del mismo `draft()`, así que los índices del `@for` y del `FormArray` coinciden 1:1.

- [ ] **Step 5: Estilos (SCSS)** — dos columnas

```scss
:host { display: block; }
.builder {
  display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-5);
  max-width: 1180px; margin: 0 auto; padding: var(--sp-5) var(--sp-4) var(--sp-7);
}
.builder__preview { position: sticky; top: var(--sp-4); }
.campo { display: grid; gap: var(--sp-1); margin-bottom: var(--sp-3); font-size: var(--fs-body-sm); }
.campo input, .campo select, .campo textarea { width: 100%; padding: var(--sp-2); border: 1px solid var(--c-border); border-radius: var(--r-sm); }
.campo-fila { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.criterios-head { display: flex; align-items: center; gap: var(--sp-3); margin: var(--sp-4) 0 var(--sp-2); }
.total { font-family: var(--ff-mono); color: var(--c-state-rechazado); }
.total--ok { color: var(--c-state-aprobado); }
.criterio-edit { display: flex; gap: var(--sp-2); align-items: center; border: 1px solid var(--c-border); border-radius: var(--r-md); padding: var(--sp-2); margin-bottom: var(--sp-2); }
.criterio-edit input, .criterio-edit select { padding: var(--sp-1) var(--sp-2); border: 1px solid var(--c-border); border-radius: var(--r-sm); }
.agregar, .guardar { padding: var(--sp-2) var(--sp-4); border-radius: var(--r-md); cursor: pointer; }
.guardar { background: var(--c-primary); color: var(--c-text-on-primary); border: none; margin-top: var(--sp-4); }
.guardar:disabled { opacity: 0.6; cursor: not-allowed; }
.errores { color: var(--c-state-rechazado); font-size: var(--fs-body-sm); }
.preview-proy { font-family: var(--ff-mono); font-size: var(--fs-caption); color: var(--c-text-faint); margin-bottom: var(--sp-3); }
@media (max-width: 900px) { .builder { grid-template-columns: 1fr; } .builder__preview { position: static; } }
```

- [ ] **Step 6: Correr el test para verlo pasar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --no-watch --include='**/builder-page.spec.ts'`
Expected: PASS. Si la preview rompe el test (criterio-field con grupos), ajustar `draftCriterios()`/índices para que coincidan 1:1 con el FormArray del snapshot de preview.

- [ ] **Step 7: Commit**

```bash
cd /home/ignacio/Projects/academconnect-web
git add src/app/features/rubricas/builder-page/
git commit -m "feat(rubricas): builder de dos paneles con preview en vivo"
```

### Task E3: Rutas, registro en shell y link en sidebar

**Files:**
- Create: `academconnect-web/src/app/features/rubricas/rubricas.routes.ts`
- Modify: `academconnect-web/src/app/app.routes.ts`
- Modify: `academconnect-web/src/app/layout/sidebar/sidebar.ts`

- [ ] **Step 1: Crear las rutas**

```ts
import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { roleGuard } from '@core/auth/role.guard';
import { unsavedGuard } from '../evaluaciones/unsaved.guard';

const ROLES = ['PROFESOR', 'EXTERNO', 'ADMINISTRADOR'];

export const RUBRICAS_ROUTES: Routes = [
  {
    path: 'rubricas',
    canActivate: [authGuard, roleGuard],
    data: { roles: ROLES },
    loadComponent: () => import('./lista-page/lista-page').then((m) => m.ListaPage),
    title: 'Rúbricas · AcademConnect',
  },
  {
    path: 'rubricas/nueva',
    canActivate: [authGuard, roleGuard],
    canDeactivate: [unsavedGuard],
    data: { roles: ROLES },
    loadComponent: () => import('./builder-page/builder-page').then((m) => m.BuilderPage),
    title: 'Nueva rúbrica · AcademConnect',
  },
  {
    path: 'rubricas/:id/editar',
    canActivate: [authGuard, roleGuard],
    canDeactivate: [unsavedGuard],
    data: { roles: ROLES },
    loadComponent: () => import('./builder-page/builder-page').then((m) => m.BuilderPage),
    title: 'Editar rúbrica · AcademConnect',
  },
];
```

- [ ] **Step 2: Registrar en `app.routes.ts`** (import + spread dentro de los children del shell)

Agregar el import:
```ts
import { RUBRICAS_ROUTES } from '@features/rubricas/rubricas.routes';
```
Y dentro de `children`, después de `...EVALUACIONES_ROUTES,`:
```ts
      ...RUBRICAS_ROUTES,
```

- [ ] **Step 3: Agregar link en el sidebar** (en el grupo del PROFESOR/EXTERNO, junto a "Evaluaciones asignadas")

En `sidebar.ts`, dentro del array `items` del grupo correspondiente, agregar:
```ts
      { label: 'Rúbricas', route: '/rubricas', exact: false },
```
(Si el sidebar arma los grupos por rol, sumar el mismo item al grupo del `EXTERNO` y del `ADMINISTRADOR` siguiendo el patrón existente.)

- [ ] **Step 4: Verificar build + suite completa**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --no-watch && npx ng build --configuration development`
Expected: todos los tests PASS y build OK.

- [ ] **Step 5: Commit**

```bash
cd /home/ignacio/Projects/academconnect-web
git add src/app/features/rubricas/rubricas.routes.ts src/app/app.routes.ts src/app/layout/sidebar/sidebar.ts
git commit -m "feat(rubricas): rutas, registro en shell y link en sidebar"
```

---

## FASE F — Verificación integral

### Task F1: Smoke manual end-to-end

- [ ] **Step 1: Backend arriba** con la migración aplicada (devtools o `./mvnw -o spring-boot:run`). Verificar headers/DB: `docker exec -i academconnect-postgres psql -U academconnect -d academconnect -c "\\d template_evaluacion"` muestra `visibilidad` y `autor_id`.
- [ ] **Step 2: Login como profesor** (Elena), ir a `/rubricas` → "Nueva rúbrica".
- [ ] **Step 3:** Crear una rúbrica con 2–3 criterios tipados, distribuir pesos a 100%, ver la **preview en vivo** actualizarse, guardar. Aparece en "Mías".
- [ ] **Step 4:** Marcarla **Pública**, confirmar que con otro profesor aparece en "Públicas" en modo **Ver** (no editable).
- [ ] **Step 5:** Editar la propia, **Desactivar**, y confirmar que no afecta ninguna evaluación previa (las asignaciones mantienen su snapshot).

---

## Notas de cierre

- **Inmutabilidad:** editar/despublicar/desactivar una rúbrica nunca toca evaluaciones pasadas (snapshot congelado en la asignación).
- **Fuera de alcance (Spec 2):** pre-menú de selección de rúbrica al asignar, creación de asignaciones por profesor, "usar por defecto" y "crear en runtime".
- **Reuso:** la preview usa `criterio-field` y utilidades de `evaluacion-form.builder`; mantener esas firmas estables.

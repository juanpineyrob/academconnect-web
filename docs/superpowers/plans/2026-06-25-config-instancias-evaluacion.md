# Configuración de estructura de evaluaciones por tipo (4a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un panel admin define, por tipo de trabajo, una lista ordenada de instancias de evaluación (nombre + N evaluadores), persistida y editable.

**Architecture:** Nueva entidad `InstanciaEvaluacionConfig` (hija por `tipo`), migración Flyway V28 que crea la tabla y siembra TCC=2×2. El endpoint admin existente `PUT /admin/tipos-trabajo-config/{tipo}` se extiende para reemplazar la lista de instancias del tipo; el GET la incluye. `TipoTrabajoConfig.evaluadoresDefault` se mantiene intacto (no rompe #2). UI admin nueva con editor de FormArray.

**Tech Stack:** Backend Spring Boot/Java (JPA, Flyway, Mockito/JUnit5) en `/home/ignacio/Projects/academconnect`. Frontend Angular v20 (signals, reactive forms) en `/home/ignacio/Projects/academconnect-web`.

## Global Constraints

- Dos repos: backend = `/home/ignacio/Projects/academconnect`, frontend = `/home/ignacio/Projects/academconnect-web`. `git` con `git -C <repo>`.
- Commits directos a `main`. **NO** trailer `Co-Authored-By`. **NO** push.
- `git add` con rutas explícitas (hay archivos sin trackear/modificados no relacionados — no incluirlos).
- Backend: Flyway + `ddl-auto=validate` → toda tabla de entidad nueva DEBE tener migración o el contexto no levanta. La última migración existente es **V27**; la nueva es **V28**.
- Compatibilidad: `TipoTrabajoConfig` conserva `modoEvaluacion` + `evaluadoresDefault` SIN cambios (lo lee #2). Las instancias van en una tabla aparte.
- Frontend Angular v20: standalone (sin `standalone:true`), `ChangeDetectionStrategy.OnPush`, `inject()`, signals, control flow nativo (`@if`/`@for`), Reactive Forms (`FormArray`), sin `ngClass`/`ngStyle`. Debe pasar AXE/WCAG AA.
- **Runner de tests frontend = Vitest browser mode, puede no estar disponible.** Para tareas frontend: escribir el `.spec` igual; intentar el runner una vez (si falla por browser, registrar el error exacto); gate real = `npx tsc -p tsconfig.app.json --noEmit` (cero errores).
- Tipos de trabajo (enum `TipoTrabajo`): `TCC`, `TESIS`, `PAPER`, `MONOGRAFIA`, `PROYECTO_INVESTIGACION`.

**Spec:** `docs/superpowers/specs/2026-06-25-config-instancias-evaluacion-design.md`

---

## Task 1: Entidad + repositorio + migración V28

**Files:**
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/domain/InstanciaEvaluacionConfig.java`
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/repository/InstanciaEvaluacionConfigRepository.java`
- Create: `/home/ignacio/Projects/academconnect/src/main/resources/db/migration/V28__instancia_evaluacion_config.sql`

**Interfaces:**
- Produces: entidad `InstanciaEvaluacionConfig` (`tipo`, `orden`, `nombre`, `evaluadoresRequeridos`); `InstanciaEvaluacionConfigRepository` con `findByTipoOrderByOrden(TipoTrabajo)` y `deleteByTipo(TipoTrabajo)`; tabla `instancia_evaluacion_config` con seed TCC=2×2.

- [ ] **Step 1: Crear la entidad**

```java
package com.academconnect.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "instancia_evaluacion_config")
@Getter
@Setter
@NoArgsConstructor
public class InstanciaEvaluacionConfig extends BaseEntity {

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private TipoTrabajo tipo;

    @Column(nullable = false)
    private int orden;

    @Column(nullable = false, length = 200)
    private String nombre;

    @Column(name = "evaluadores_requeridos", nullable = false)
    private int evaluadoresRequeridos;
}
```

- [ ] **Step 2: Crear el repositorio**

```java
package com.academconnect.repository;

import com.academconnect.domain.InstanciaEvaluacionConfig;
import com.academconnect.domain.TipoTrabajo;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InstanciaEvaluacionConfigRepository
        extends JpaRepository<InstanciaEvaluacionConfig, Long> {

    List<InstanciaEvaluacionConfig> findByTipoOrderByOrden(TipoTrabajo tipo);

    void deleteByTipo(TipoTrabajo tipo);
}
```

- [ ] **Step 3: Crear la migración V28**

Crear `src/main/resources/db/migration/V28__instancia_evaluacion_config.sql`:

```sql
-- V28__instancia_evaluacion_config.sql

-- Estructura de instancias de evaluación por tipo de trabajo (4a).
-- Cada tipo tiene una lista ordenada de instancias, cada una con N evaluadores.
CREATE TABLE instancia_evaluacion_config (
    id BIGSERIAL PRIMARY KEY,
    tipo VARCHAR(50) NOT NULL,
    orden INTEGER NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    evaluadores_requeridos INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    updated_by VARCHAR(100) NOT NULL,
    CONSTRAINT chk_instancia_tipo CHECK (
        tipo IN ('TCC','TESIS','PAPER','MONOGRAFIA','PROYECTO_INVESTIGACION')
    ),
    CONSTRAINT chk_instancia_evaluadores CHECK (evaluadores_requeridos >= 1),
    CONSTRAINT uq_instancia_tipo_orden UNIQUE (tipo, orden)
);

CREATE INDEX ix_instancia_tipo ON instancia_evaluacion_config (tipo);

-- Seed: TCC = 2 instancias × 2 evaluadores (proceso real de la facultad).
INSERT INTO instancia_evaluacion_config
    (tipo, orden, nombre, evaluadores_requeridos, created_at, updated_at, created_by, updated_by)
VALUES
    ('TCC', 0, 'TCC1', 2, now(), now(), 'system', 'system'),
    ('TCC', 1, 'TCC2', 2, now(), now(), 'system', 'system');
```

> Verificá que las columnas de auditoría coincidan con `BaseEntity` (compará con `V27__solicitud_evaluacion.sql`, que usa el mismo `BaseEntity`: `id BIGSERIAL`, `created_at`, `updated_at`, `created_by`, `updated_by`). Ajustá la DDL si difiere para que `ddl-auto=validate` pase.

- [ ] **Step 4: Compilar + bootear contexto (valida Flyway + schema)**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: BUILD SUCCESS (un `@SpringBootTest` aplica V28 y Hibernate `validate` pasa). Si ese test no existe, buscá uno con `grep -rl "@SpringBootTest" src/test/java | head -1` y corré esa clase por nombre.

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/domain/InstanciaEvaluacionConfig.java src/main/java/com/academconnect/repository/InstanciaEvaluacionConfigRepository.java src/main/resources/db/migration/V28__instancia_evaluacion_config.sql
git -C /home/ignacio/Projects/academconnect commit -m "feat(config-instancias): entidad, repo y migración con seed TCC=2x2"
```

---

## Task 2: DTOs (request/response) extendidos

**Files:**
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/InstanciaEvaluacionConfigDto.java`
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/InstanciaEvaluacionConfigInput.java`
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/TipoTrabajoConfigRequest.java`
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/TipoTrabajoConfigResponse.java`

**Interfaces:**
- Produces: `InstanciaEvaluacionConfigDto(int orden, String nombre, int evaluadoresRequeridos)`; `InstanciaEvaluacionConfigInput(String nombre, Integer evaluadoresRequeridos)` (validado); `TipoTrabajoConfigRequest` gana `List<InstanciaEvaluacionConfigInput> instancias`; `TipoTrabajoConfigResponse` gana `List<InstanciaEvaluacionConfigDto> instancias`.

- [ ] **Step 1: DTO de salida de instancia**

```java
package com.academconnect.dto;

public record InstanciaEvaluacionConfigDto(
        int orden,
        String nombre,
        int evaluadoresRequeridos) {
}
```

- [ ] **Step 2: DTO de entrada de instancia**

```java
package com.academconnect.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record InstanciaEvaluacionConfigInput(
        @NotBlank @Size(max = 200) String nombre,
        @NotNull @Min(1) Integer evaluadoresRequeridos) {
}
```

- [ ] **Step 3: Extender el request**

Reemplazar el contenido de `TipoTrabajoConfigRequest.java` por:

```java
package com.academconnect.dto;

import com.academconnect.domain.ModoEvaluacion;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record TipoTrabajoConfigRequest(
        @NotNull ModoEvaluacion modoEvaluacion,
        @NotNull @Min(1) Integer evaluadoresDefault,
        @Valid List<InstanciaEvaluacionConfigInput> instancias) {
}
```

- [ ] **Step 4: Extender el response**

Reemplazar el contenido de `TipoTrabajoConfigResponse.java` por:

```java
package com.academconnect.dto;

import com.academconnect.domain.ModoEvaluacion;
import com.academconnect.domain.TipoTrabajo;
import java.util.List;

public record TipoTrabajoConfigResponse(
        TipoTrabajo tipo,
        ModoEvaluacion modoEvaluacion,
        int evaluadoresDefault,
        List<InstanciaEvaluacionConfigDto> instancias) {
}
```

- [ ] **Step 5: Compilar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q compile`
Expected: FALLA de compilación en `TipoTrabajoConfigService` (el `toResponse` y `new TipoTrabajoConfigResponse(...)` ahora necesitan el 4º arg). Eso es esperado — se arregla en la Task 3. (Si preferís dejar el repo compilando, esta task se puede commitear junto con la Task 3; ver Step 6.)

- [ ] **Step 6: Commit (junto con Task 3)**

NO commitees por separado: estos DTOs rompen la compilación de `TipoTrabajoConfigService` hasta que la Task 3 lo actualice. Implementá Task 3 y commiteá ambos juntos con el mensaje de la Task 3. (Esta nota evita dejar `main` en estado no compilable.)

---

## Task 3: Servicio — reemplazo de instancias en el upsert (TDD)

**Files:**
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/service/TipoTrabajoConfigService.java`
- Test: `/home/ignacio/Projects/academconnect/src/test/java/com/academconnect/service/TipoTrabajoConfigServiceTests.java`

**Interfaces:**
- Consumes: Task 1 (entity/repo), Task 2 (DTOs). `TipoTrabajoConfigRepository`, `InstanciaEvaluacionConfigRepository`.
- Produces: `listar()`, `buscarPorTipo(tipo)`, `actualizar(tipo, request)` ahora pueblan/persisten `instancias`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/test/java/com/academconnect/service/TipoTrabajoConfigServiceTests.java`:

```java
package com.academconnect.service;

import com.academconnect.domain.InstanciaEvaluacionConfig;
import com.academconnect.domain.ModoEvaluacion;
import com.academconnect.domain.TipoTrabajo;
import com.academconnect.domain.TipoTrabajoConfig;
import com.academconnect.dto.InstanciaEvaluacionConfigInput;
import com.academconnect.dto.TipoTrabajoConfigRequest;
import com.academconnect.dto.TipoTrabajoConfigResponse;
import com.academconnect.repository.InstanciaEvaluacionConfigRepository;
import com.academconnect.repository.TipoTrabajoConfigRepository;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Optional;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TipoTrabajoConfigServiceTests {

    @InjectMocks private TipoTrabajoConfigService service;
    @Mock private TipoTrabajoConfigRepository repository;
    @Mock private InstanciaEvaluacionConfigRepository instanciaRepository;

    @BeforeEach
    void setup() {
        Mockito.when(repository.save(Mockito.any())).thenAnswer(i -> i.getArgument(0));
        Mockito.when(instanciaRepository.findByTipoOrderByOrden(Mockito.any())).thenReturn(List.of());
    }

    private TipoTrabajoConfigRequest req(List<InstanciaEvaluacionConfigInput> instancias) {
        return new TipoTrabajoConfigRequest(ModoEvaluacion.SINCRONO, 3, instancias);
    }

    @Test
    void actualizar_reemplazaInstanciasConOrdenContiguo() {
        var req = req(List.of(
                new InstanciaEvaluacionConfigInput("TCC1", 2),
                new InstanciaEvaluacionConfigInput("TCC2", 2)));

        service.actualizar(TipoTrabajo.TCC, req);

        Mockito.verify(instanciaRepository).deleteByTipo(TipoTrabajo.TCC);
        ArgumentCaptor<List<InstanciaEvaluacionConfig>> cap = ArgumentCaptor.forClass(List.class);
        Mockito.verify(instanciaRepository).saveAll(cap.capture());
        List<InstanciaEvaluacionConfig> guardadas = cap.getValue();
        Assertions.assertEquals(2, guardadas.size());
        Assertions.assertEquals(0, guardadas.get(0).getOrden());
        Assertions.assertEquals("TCC1", guardadas.get(0).getNombre());
        Assertions.assertEquals(1, guardadas.get(1).getOrden());
        Assertions.assertEquals(TipoTrabajo.TCC, guardadas.get(0).getTipo());
    }

    @Test
    void actualizar_conInstanciasNullNoGuardaNinguna() {
        service.actualizar(TipoTrabajo.TESIS, req(null));
        Mockito.verify(instanciaRepository).deleteByTipo(TipoTrabajo.TESIS);
        Mockito.verify(instanciaRepository).saveAll(List.of());
    }

    @Test
    void actualizar_preservaEvaluadoresDefault() {
        var resp = service.actualizar(TipoTrabajo.TCC, req(List.of()));
        Assertions.assertEquals(3, resp.evaluadoresDefault());
        Assertions.assertEquals(ModoEvaluacion.SINCRONO, resp.modoEvaluacion());
    }

    @Test
    void buscarPorTipo_incluyeInstanciasOrdenadas() {
        var cfg = new TipoTrabajoConfig();
        cfg.setTipo(TipoTrabajo.TCC);
        cfg.setModoEvaluacion(ModoEvaluacion.SINCRONO);
        cfg.setEvaluadoresDefault(2);
        Mockito.when(repository.findById(TipoTrabajo.TCC)).thenReturn(Optional.of(cfg));
        var i0 = new InstanciaEvaluacionConfig();
        i0.setTipo(TipoTrabajo.TCC); i0.setOrden(0); i0.setNombre("TCC1"); i0.setEvaluadoresRequeridos(2);
        Mockito.when(instanciaRepository.findByTipoOrderByOrden(TipoTrabajo.TCC)).thenReturn(List.of(i0));

        TipoTrabajoConfigResponse resp = service.buscarPorTipo(TipoTrabajo.TCC);

        Assertions.assertEquals(1, resp.instancias().size());
        Assertions.assertEquals("TCC1", resp.instancias().get(0).nombre());
        Assertions.assertEquals(0, resp.instancias().get(0).orden());
    }
}
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=TipoTrabajoConfigServiceTests`
Expected: FALLA de compilación / tests (el servicio aún no inyecta `instanciaRepository` ni puebla instancias).

- [ ] **Step 3: Implementar el servicio**

Reemplazar el contenido de `TipoTrabajoConfigService.java` por:

```java
package com.academconnect.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.academconnect.domain.InstanciaEvaluacionConfig;
import com.academconnect.domain.TipoTrabajo;
import com.academconnect.domain.TipoTrabajoConfig;
import com.academconnect.dto.InstanciaEvaluacionConfigDto;
import com.academconnect.dto.InstanciaEvaluacionConfigInput;
import com.academconnect.dto.TipoTrabajoConfigRequest;
import com.academconnect.dto.TipoTrabajoConfigResponse;
import com.academconnect.exception.ResourceNotFoundException;
import com.academconnect.repository.InstanciaEvaluacionConfigRepository;
import com.academconnect.repository.TipoTrabajoConfigRepository;

import lombok.RequiredArgsConstructor;

/** F14 / 4a — admin gestiona modo, default de evaluadores y estructura de instancias por tipo. */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class TipoTrabajoConfigService {

    private final TipoTrabajoConfigRepository repository;
    private final InstanciaEvaluacionConfigRepository instanciaRepository;

    public List<TipoTrabajoConfigResponse> listar() {
        return repository.findAll().stream().map(this::toResponse).toList();
    }

    public TipoTrabajoConfigResponse buscarPorTipo(TipoTrabajo tipo) {
        return repository.findById(tipo).map(this::toResponse)
                .orElseThrow(() -> new ResourceNotFoundException("TipoTrabajoConfig", tipo));
    }

    @Transactional
    public TipoTrabajoConfigResponse actualizar(TipoTrabajo tipo, TipoTrabajoConfigRequest request) {
        var config = repository.findById(tipo).orElseGet(() -> {
            var nueva = new TipoTrabajoConfig();
            nueva.setTipo(tipo);
            return nueva;
        });
        config.setModoEvaluacion(request.modoEvaluacion());
        config.setEvaluadoresDefault(request.evaluadoresDefault());
        var savedConfig = repository.save(config);

        instanciaRepository.deleteByTipo(tipo);
        List<InstanciaEvaluacionConfigInput> entradas =
                request.instancias() == null ? List.of() : request.instancias();
        List<InstanciaEvaluacionConfig> nuevas = new java.util.ArrayList<>();
        for (int i = 0; i < entradas.size(); i++) {
            var in = entradas.get(i);
            var inst = new InstanciaEvaluacionConfig();
            inst.setTipo(tipo);
            inst.setOrden(i);
            inst.setNombre(in.nombre());
            inst.setEvaluadoresRequeridos(in.evaluadoresRequeridos());
            nuevas.add(inst);
        }
        instanciaRepository.saveAll(nuevas);

        return toResponse(savedConfig);
    }

    private TipoTrabajoConfigResponse toResponse(TipoTrabajoConfig c) {
        List<InstanciaEvaluacionConfigDto> instancias =
                instanciaRepository.findByTipoOrderByOrden(c.getTipo()).stream()
                        .map(i -> new InstanciaEvaluacionConfigDto(
                                i.getOrden(), i.getNombre(), i.getEvaluadoresRequeridos()))
                        .toList();
        return new TipoTrabajoConfigResponse(
                c.getTipo(), c.getModoEvaluacion(), c.getEvaluadoresDefault(), instancias);
    }
}
```

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=TipoTrabajoConfigServiceTests`
Expected: PASS (4/4).

- [ ] **Step 5: Commit (incluye los DTOs de la Task 2)**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/dto/InstanciaEvaluacionConfigDto.java src/main/java/com/academconnect/dto/InstanciaEvaluacionConfigInput.java src/main/java/com/academconnect/dto/TipoTrabajoConfigRequest.java src/main/java/com/academconnect/dto/TipoTrabajoConfigResponse.java src/main/java/com/academconnect/service/TipoTrabajoConfigService.java src/test/java/com/academconnect/service/TipoTrabajoConfigServiceTests.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(config-instancias): DTOs y servicio que reemplaza la lista de instancias por tipo"
```

---

## Task 4: Verificación de extremo del endpoint admin (regresión)

**Files:**
- (sin cambios de código) — el `TipoTrabajoConfigController` ya delega en el servicio; sus firmas no cambian. Esta task sólo verifica que el contexto levanta y la suite pasa.

- [ ] **Step 1: Confirmar que el controller compila con los DTOs nuevos**

Leé `src/main/java/com/academconnect/controller/TipoTrabajoConfigController.java` y confirmá que sólo usa `TipoTrabajoConfigRequest`/`TipoTrabajoConfigResponse` a través del servicio (no construye los records a mano). Si construye alguno a mano, ajustalo al nuevo constructor. (En el código actual NO lo hace — delega en `service`.)

- [ ] **Step 2: Suite backend completa**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test`
Expected: BUILD SUCCESS (los `@SpringBootTest` bootean Flyway con V28 y `validate`; el seed deja TCC con 2 instancias). Si algún test existente construía `TipoTrabajoConfigResponse`/`Request` con el constructor viejo (3 args), actualizalo al de 4 args (instancias).

- [ ] **Step 3: Commit (sólo si hubo ajustes de compilación)**

Si tuviste que tocar algún archivo para que compile/pase, commiteá con rutas explícitas:

```bash
git -C /home/ignacio/Projects/academconnect add <archivos ajustados>
git -C /home/ignacio/Projects/academconnect commit -m "fix(config-instancias): ajusta usos del DTO de config al nuevo constructor"
```

Si no hubo cambios, no hay commit (la suite verde es el entregable).

---

## Task 5: Servicio + modelos frontend (TDD)

**Files:**
- Create: `/home/ignacio/Projects/academconnect-web/src/app/features/admin/tipos-trabajo-config.models.ts`
- Create: `/home/ignacio/Projects/academconnect-web/src/app/features/admin/tipos-trabajo-config.service.ts`
- Test: `/home/ignacio/Projects/academconnect-web/src/app/features/admin/tipos-trabajo-config.service.spec.ts`

**Interfaces:**
- Produces: `TiposTrabajoConfigService` (`listar()`, `buscarPorTipo(tipo)`, `guardar(tipo, payload)`); modelos `InstanciaConfig`, `TipoTrabajoConfig`, `TipoTrabajoConfigPayload`.

- [ ] **Step 1: Modelos**

```typescript
export type TipoTrabajo = 'TCC' | 'TESIS' | 'PAPER' | 'MONOGRAFIA' | 'PROYECTO_INVESTIGACION';
export type ModoEvaluacion = 'SINCRONO' | 'ASINCRONO' | 'HIBRIDO';

export interface InstanciaConfig {
  orden: number;
  nombre: string;
  evaluadoresRequeridos: number;
}

export interface TipoTrabajoConfig {
  tipo: TipoTrabajo;
  modoEvaluacion: ModoEvaluacion;
  evaluadoresDefault: number;
  instancias: InstanciaConfig[];
}

export interface TipoTrabajoConfigPayload {
  modoEvaluacion: ModoEvaluacion;
  evaluadoresDefault: number;
  instancias: { nombre: string; evaluadoresRequeridos: number }[];
}
```

> Verificá los valores reales del enum `ModoEvaluacion` del backend (`SINCRONO`, `ASINCRONO`, `HIBRIDO`) — están en `domain/ModoEvaluacion.java`. Ajustá si difieren.

- [ ] **Step 2: Escribir el test que falla**

Crear `tipos-trabajo-config.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { TiposTrabajoConfigService } from './tipos-trabajo-config.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('TiposTrabajoConfigService', () => {
  let service: TiposTrabajoConfigService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TiposTrabajoConfigService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('buscarPorTipo pega GET a /admin/tipos-trabajo-config/{tipo}', () => {
    service.buscarPorTipo('TCC').subscribe();
    const req = http.expectOne(`${api}/admin/tipos-trabajo-config/TCC`);
    expect(req.request.method).toBe('GET');
    req.flush({ tipo: 'TCC', modoEvaluacion: 'SINCRONO', evaluadoresDefault: 2, instancias: [] });
  });

  it('guardar pega PUT con el payload de instancias', () => {
    const payload = {
      modoEvaluacion: 'SINCRONO' as const, evaluadoresDefault: 2,
      instancias: [{ nombre: 'TCC1', evaluadoresRequeridos: 2 }],
    };
    service.guardar('TCC', payload).subscribe();
    const req = http.expectOne(`${api}/admin/tipos-trabajo-config/TCC`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.instancias.length).toBe(1);
    req.flush({ tipo: 'TCC', ...payload, instancias: [{ orden: 0, nombre: 'TCC1', evaluadoresRequeridos: 2 }] });
  });
});
```

- [ ] **Step 3: Correr el test (falla o runner-unavailable)**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --watch=false --include='**/tipos-trabajo-config.service.spec.ts'`
Si el runner browser no está, registrá el error y seguí con el typecheck (Step 5).

- [ ] **Step 4: Implementar el servicio**

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import {
  TipoTrabajo,
  TipoTrabajoConfig,
  TipoTrabajoConfigPayload,
} from './tipos-trabajo-config.models';

@Injectable({ providedIn: 'root' })
export class TiposTrabajoConfigService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/admin/tipos-trabajo-config`;

  listar(): Observable<TipoTrabajoConfig[]> {
    return this.http.get<TipoTrabajoConfig[]>(this.base);
  }

  buscarPorTipo(tipo: TipoTrabajo): Observable<TipoTrabajoConfig> {
    return this.http.get<TipoTrabajoConfig>(`${this.base}/${tipo}`);
  }

  guardar(tipo: TipoTrabajo, payload: TipoTrabajoConfigPayload): Observable<TipoTrabajoConfig> {
    return this.http.put<TipoTrabajoConfig>(`${this.base}/${tipo}`, payload);
  }
}
```

- [ ] **Step 5: Verificar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit`
Expected: cero errores.

- [ ] **Step 6: Commit**

```bash
git -C /home/ignacio/Projects/academconnect-web add src/app/features/admin/tipos-trabajo-config.models.ts src/app/features/admin/tipos-trabajo-config.service.ts src/app/features/admin/tipos-trabajo-config.service.spec.ts
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(config-instancias): servicio y modelos frontend"
```

---

## Task 6: Página admin con editor de instancias + ruta + sidebar

**Files:**
- Create: `/home/ignacio/Projects/academconnect-web/src/app/features/admin/tipos-trabajo-config-page/tipos-trabajo-config-page.ts`
- Create: `.../tipos-trabajo-config-page/tipos-trabajo-config-page.html`
- Create: `.../tipos-trabajo-config-page/tipos-trabajo-config-page.scss`
- Modify: `/home/ignacio/Projects/academconnect-web/src/app/features/admin/admin.routes.ts`
- Modify: `/home/ignacio/Projects/academconnect-web/src/app/layout/sidebar/sidebar.ts`

**Interfaces:**
- Consumes: Task 5 (`TiposTrabajoConfigService`, modelos).

- [ ] **Step 1: Crear la página TS**

```typescript
import {
  ChangeDetectionStrategy, Component, DestroyRef, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { TiposTrabajoConfigService } from '../tipos-trabajo-config.service';
import { ModoEvaluacion, TipoTrabajo } from '../tipos-trabajo-config.models';

const TIPOS: TipoTrabajo[] = ['TCC', 'TESIS', 'PAPER', 'MONOGRAFIA', 'PROYECTO_INVESTIGACION'];
const MODOS: ModoEvaluacion[] = ['SINCRONO', 'ASINCRONO', 'HIBRIDO'];

@Component({
  selector: 'ac-tipos-trabajo-config-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, Card],
  templateUrl: './tipos-trabajo-config-page.html',
  styleUrl: './tipos-trabajo-config-page.scss',
})
export class TiposTrabajoConfigPage {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(TiposTrabajoConfigService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tipos = TIPOS;
  protected readonly modos = MODOS;
  protected readonly tipoSel = signal<TipoTrabajo | null>(null);
  protected readonly loading = signal<boolean>(false);
  protected readonly saving = signal<boolean>(false);
  protected readonly guardado = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    modoEvaluacion: ['SINCRONO' as ModoEvaluacion, Validators.required],
    evaluadoresDefault: [3, [Validators.required, Validators.min(1)]],
    instancias: this.fb.array<FormGroup>([]),
  });

  protected get instancias(): FormArray<FormGroup> {
    return this.form.controls.instancias;
  }

  protected nuevaInstancia(nombre = '', evaluadores = 2): FormGroup {
    return this.fb.nonNullable.group({
      nombre: [nombre, [Validators.required, Validators.maxLength(200)]],
      evaluadoresRequeridos: [evaluadores, [Validators.required, Validators.min(1)]],
    });
  }

  protected seleccionar(tipo: TipoTrabajo): void {
    this.tipoSel.set(tipo);
    this.guardado.set(false);
    this.error.set(null);
    this.loading.set(true);
    this.service.buscarPorTipo(tipo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cfg) => {
          this.form.controls.modoEvaluacion.setValue(cfg.modoEvaluacion);
          this.form.controls.evaluadoresDefault.setValue(cfg.evaluadoresDefault);
          this.instancias.clear();
          for (const i of cfg.instancias) {
            this.instancias.push(this.nuevaInstancia(i.nombre, i.evaluadoresRequeridos));
          }
          this.loading.set(false);
        },
        error: () => {
          // tipo sin config aún: form en defaults, lista vacía
          this.form.controls.modoEvaluacion.setValue('SINCRONO');
          this.form.controls.evaluadoresDefault.setValue(3);
          this.instancias.clear();
          this.loading.set(false);
        },
      });
  }

  protected agregarInstancia(): void {
    this.instancias.push(this.nuevaInstancia());
  }

  protected quitarInstancia(i: number): void {
    this.instancias.removeAt(i);
  }

  protected subir(i: number): void {
    if (i <= 0) return;
    const ctrl = this.instancias.at(i);
    this.instancias.removeAt(i);
    this.instancias.insert(i - 1, ctrl);
  }

  protected bajar(i: number): void {
    if (i >= this.instancias.length - 1) return;
    const ctrl = this.instancias.at(i);
    this.instancias.removeAt(i);
    this.instancias.insert(i + 1, ctrl);
  }

  protected guardar(): void {
    const tipo = this.tipoSel();
    if (!tipo || this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.guardado.set(false);
    this.error.set(null);
    this.service.guardar(tipo, {
      modoEvaluacion: this.form.controls.modoEvaluacion.value,
      evaluadoresDefault: this.form.controls.evaluadoresDefault.value,
      instancias: this.instancias.controls.map((c) => ({
        nombre: (c.get('nombre')!.value as string).trim(),
        evaluadoresRequeridos: c.get('evaluadoresRequeridos')!.value as number,
      })),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.saving.set(false); this.guardado.set(true); },
        error: () => { this.saving.set(false); this.error.set('No se pudo guardar.'); },
      });
  }
}
```

- [ ] **Step 2: Crear el template HTML**

```html
<section class="ttc">
  <header class="ttc__header">
    <h1 class="ttc__title">Estructura de evaluaciones por tipo</h1>
  </header>

  <div class="ttc__tipos" role="tablist" aria-label="Tipos de trabajo">
    @for (t of tipos; track t) {
      <ac-button size="sm" [variant]="tipoSel() === t ? 'primary' : 'ghost'"
                 (click)="seleccionar(t)">{{ t }}</ac-button>
    }
  </div>

  @if (tipoSel(); as tipo) {
    @if (loading()) {
      <p role="status">Cargando…</p>
    } @else {
      <ac-card padding="lg">
        <form class="ttc__form" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
          <label class="ttc__field">
            <span class="ttc__label">Modo de evaluación</span>
            <select formControlName="modoEvaluacion" class="ttc__select">
              @for (m of modos; track m) { <option [value]="m">{{ m }}</option> }
            </select>
          </label>

          <label class="ttc__field">
            <span class="ttc__label">Evaluadores por defecto</span>
            <input type="number" min="1" formControlName="evaluadoresDefault" class="ttc__input" />
          </label>

          <fieldset class="ttc__field" formArrayName="instancias">
            <legend class="ttc__label">Instancias de evaluación</legend>
            @for (inst of instancias.controls; track $index) {
              <div class="ttc__instancia" [formGroupName]="$index">
                <input type="text" formControlName="nombre" maxlength="200"
                       class="ttc__input" [attr.aria-label]="'Nombre de la instancia ' + ($index + 1)"
                       placeholder="Nombre (ej. TCC1)" />
                <input type="number" min="1" formControlName="evaluadoresRequeridos"
                       class="ttc__input ttc__input--num"
                       [attr.aria-label]="'Evaluadores de la instancia ' + ($index + 1)" />
                <ac-button type="button" size="sm" variant="ghost"
                           [attr.aria-label]="'Subir instancia ' + ($index + 1)" (click)="subir($index)">↑</ac-button>
                <ac-button type="button" size="sm" variant="ghost"
                           [attr.aria-label]="'Bajar instancia ' + ($index + 1)" (click)="bajar($index)">↓</ac-button>
                <ac-button type="button" size="sm" variant="ghost"
                           [attr.aria-label]="'Quitar instancia ' + ($index + 1)" (click)="quitarInstancia($index)">×</ac-button>
              </div>
            } @empty {
              <p class="ttc__hint">Sin instancias. Este tipo usará evaluación de ronda única.</p>
            }
            <ac-button type="button" size="sm" variant="ghost" (click)="agregarInstancia()">+ Agregar instancia</ac-button>
          </fieldset>

          @if (error(); as e) { <p class="ttc__error" role="alert">{{ e }}</p> }
          @if (guardado()) { <p class="ttc__ok" role="status">Guardado.</p> }

          <div class="ttc__actions">
            <ac-button size="sm" type="submit" [loading]="saving()"
                       [disabled]="saving() || form.invalid">Guardar</ac-button>
          </div>
        </form>
      </ac-card>
    }
  } @else {
    <p class="ttc__hint">Elegí un tipo de trabajo para configurar sus instancias.</p>
  }
</section>
```

- [ ] **Step 3: Crear el SCSS**

```scss
.ttc__tipos, .ttc__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.ttc__form { display: grid; gap: 1rem; }
.ttc__instancia { display: flex; gap: 0.5rem; align-items: center; margin-block: 0.25rem; }
.ttc__input--num { max-width: 6rem; }
```

- [ ] **Step 4: Registrar la ruta admin**

En `src/app/features/admin/admin.routes.ts`, agregar una entrada siguiendo el patrón de las existentes (mismo `canActivate`/`data.roles`):

```typescript
  {
    path: 'admin/tipos-trabajo-config',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./tipos-trabajo-config-page/tipos-trabajo-config-page')
        .then((m) => m.TiposTrabajoConfigPage),
    title: 'Configuración de evaluaciones · AcademConnect',
  },
```

- [ ] **Step 5: Link en el sidebar admin**

En `src/app/layout/sidebar/sidebar.ts`, dentro de `SECTIONS_ADMIN` (el grupo principal que ya tiene "Panel de administración", "Importar trabajos", etc.), agregar un item siguiendo el formato existente:

```typescript
      { label: 'Tipos de trabajo', route: '/admin/tipos-trabajo-config' },
```

- [ ] **Step 6: Verificar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit`
Expected: cero errores.

- [ ] **Step 7: Commit**

```bash
git -C /home/ignacio/Projects/academconnect-web add src/app/features/admin/tipos-trabajo-config-page/ src/app/features/admin/admin.routes.ts src/app/layout/sidebar/sidebar.ts
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(config-instancias): página admin con editor de instancias por tipo"
```

---

## Verificación final

- [ ] Backend: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test` → PASS (incluye `@SpringBootTest` con V28; el seed deja TCC con 2 instancias).
- [ ] Frontend: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit` → cero errores (correr los specs en entorno con browser runner).
- [ ] Manual: como admin → entrar a "Tipos de trabajo", elegir TCC → ver las 2 instancias sembradas (TCC1/TCC2, 2 evaluadores c/u); agregar/quitar/reordenar y guardar; recargar y verificar que persiste; cambiar a otro tipo → lista vacía editable.

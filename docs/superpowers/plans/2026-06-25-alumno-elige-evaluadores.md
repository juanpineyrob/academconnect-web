# El alumno elige sus evaluadores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El estudiante arma su banca evaluadora invitando evaluadores (recomendados o libres); cada evaluador acepta/rechaza, y al aceptar se crea la `Asignacion`.

**Architecture:** Flujo propio `SolicitudEvaluacion` (entidad/repo/DTOs/mapper/servicio/controller) paralelo a `SolicitudCoorientacion`, reusando `EstadoInvitacion`. Al **aceptar** se crea la `Asignacion` reutilizando `AsignacionService.crear` (congela snapshot, dispara evento, pasa el trabajo a `EN_EVALUACION`). Se agrega un flag `es_por_defecto` + seed de un template genérico cuyo snapshot usa la asignación. El recomendador (`sugerirRevisores`) se expone dueño-only al alumno.

**Tech Stack:** Backend Spring Boot/Java (JPA, Flyway, MapStruct, Mockito/JUnit5) en `/home/ignacio/Projects/academconnect`. Frontend Angular v20 (signals, reactive forms) en `/home/ignacio/Projects/academconnect-web`.

## Global Constraints

- Dos repos: backend = `/home/ignacio/Projects/academconnect`, frontend = `/home/ignacio/Projects/academconnect-web`. `git` con `git -C <repo>`.
- Commits directos a `main`. **NO** trailer `Co-Authored-By`. **NO** push.
- `git add` con rutas explícitas (hay archivos sin trackear/modificados no relacionados — no incluirlos).
- Backend: el esquema se gestiona con **Flyway** (`src/main/resources/db/migration/V*.sql`) y `spring.jpa.hibernate.ddl-auto=validate` → toda tabla/columna de una entidad nueva DEBE tener migración o el contexto Spring no levanta. La última migración existente es **V25**; las nuevas son **V26** y **V27**.
- Backend: seguir el patrón de `SolicitudCoorientacion*` (entity/repo/dto/mapper/service/controller/test) y de `InvitacionOrientacion*`.
- Frontend Angular v20: standalone (sin `standalone:true`), `ChangeDetectionStrategy.OnPush`, `inject()`, signals, `computed()`, control flow nativo (`@if`/`@for`), sin `ngClass`/`ngStyle`. Debe pasar AXE/WCAG AA.
- **Runner de tests frontend = Vitest browser mode, puede no estar disponible.** Para tareas frontend: escribir el `.spec` igual; intentar el runner una vez (si falla por browser, registrar el error exacto); gate real = `npx tsc -p tsconfig.app.json --noEmit` (cero errores).
- Reglas de negocio (spec): N = `TipoTrabajoConfig.evaluadoresDefault` del tipo; invitar mientras `(asignaciones ACTIVA + solicitudes PENDIENTE) < N`; trabajo con orientador, estado `EN_DESARROLLO`/`EN_EVALUACION`, con ≥1 versión; invitado activo, rol PROFESOR/EXTERNO, ≠ orientador, ≠ coorientador, ≠ estudiante, sin COI; al aceptar se crea la `Asignacion` con la última versión y el template por defecto.

**Spec:** `docs/superpowers/specs/2026-06-25-alumno-elige-evaluadores-design.md`

---

## Task 1: Template por defecto (entidad + migración + finder)

**Files:**
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/domain/TemplateEvaluacion.java`
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/repository/TemplateEvaluacionRepository.java`
- Create: `/home/ignacio/Projects/academconnect/src/main/resources/db/migration/V26__template_por_defecto.sql`

**Interfaces:**
- Produces: `TemplateEvaluacion.esPorDefecto` (column `es_por_defecto`); `TemplateEvaluacionRepository.findFirstByEsPorDefectoTrueAndActivoTrue()` → `Optional<TemplateEvaluacion>`; un template sembrado con `es_por_defecto = true`.

- [ ] **Step 1: Agregar el campo a la entidad**

En `TemplateEvaluacion.java`, después del campo `private boolean activo = true;` agregar:

```java
    /** Marca la rúbrica genérica usada por defecto al crear asignaciones. Exactamente una en true. */
    @Column(name = "es_por_defecto", nullable = false)
    private boolean esPorDefecto = false;
```

- [ ] **Step 2: Agregar el finder al repositorio**

En `TemplateEvaluacionRepository.java`, agregar el import `import java.util.Optional;` si falta y el método:

```java
    Optional<TemplateEvaluacion> findFirstByEsPorDefectoTrueAndActivoTrue();
```

- [ ] **Step 3: Crear la migración V26 (columna + seed)**

Crear `src/main/resources/db/migration/V26__template_por_defecto.sql`:

```sql
-- V26__template_por_defecto.sql

-- Rúbrica genérica por defecto: su snapshot se congela en la Asignacion creada
-- cuando un evaluador acepta una solicitud de evaluación.
ALTER TABLE template_evaluacion
    ADD COLUMN es_por_defecto BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO template_evaluacion (
    nombre, descripcion, visibilidad, criterios, activo, umbral_aprobacion,
    es_por_defecto, created_at, updated_at, created_by, updated_by
) VALUES (
    'Rúbrica genérica',
    'Rúbrica por defecto del sistema para evaluación de trabajos.',
    'PUBLICO',
    '[{"codigo":"metodologia","nombre":"Metodología","peso":0.4,"escalaMin":0,"escalaMax":10},{"codigo":"contenido","nombre":"Contenido","peso":0.4,"escalaMin":0,"escalaMax":10},{"codigo":"presentacion","nombre":"Presentación","peso":0.2,"escalaMin":0,"escalaMax":10}]'::jsonb,
    TRUE,
    6.00,
    TRUE,
    now(), now(), 'system', 'system'
);

-- A lo sumo un template por defecto.
CREATE UNIQUE INDEX uq_template_por_defecto
    ON template_evaluacion (es_por_defecto)
    WHERE es_por_defecto = TRUE;
```

> Verificá antes de compilar que las columnas NOT NULL de `template_evaluacion` quedan satisfechas por el INSERT: `nombre`, `criterios`, `activo`, `umbral_aprobacion`, `visibilidad`, `created_at`, `updated_at`, `created_by`, `updated_by`, `es_por_defecto`. `scope` es nullable (V17), `autor_id`/`descripcion`/`tipo_trabajo_aplicable` nullable. Si alguna difiere, ajustá el INSERT para que `ddl-auto=validate` + el seed no fallen.

- [ ] **Step 4: Compilar y arrancar el contexto (valida Flyway + schema)**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest='*TemplateEvaluacion*'`
Expected: BUILD SUCCESS / PASS (los `@SpringBootTest` corren Flyway contra Postgres y validan el schema; si no hay test que matchee, corré `./mvnw -q compile` y además un test que levante contexto, p. ej. `-Dtest='*ApplicationTests*'`).

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/domain/TemplateEvaluacion.java src/main/java/com/academconnect/repository/TemplateEvaluacionRepository.java src/main/resources/db/migration/V26__template_por_defecto.sql
git -C /home/ignacio/Projects/academconnect commit -m "feat(evaluadores): flag y seed de template por defecto"
```

---

## Task 2: Entidad `SolicitudEvaluacion` + repos + migración

**Files:**
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/domain/SolicitudEvaluacion.java`
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/repository/SolicitudEvaluacionRepository.java`
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/repository/AsignacionRepository.java`
- Create: `/home/ignacio/Projects/academconnect/src/main/resources/db/migration/V27__solicitud_evaluacion.sql`

**Interfaces:**
- Produces: entidad `SolicitudEvaluacion` (`trabajo`, `invitado`, `estado`, `motivo`, `respuesta`, `resueltaEn`); `SolicitudEvaluacionRepository` (`existsByTrabajoIdAndInvitadoIdAndEstado`, `countByTrabajoIdAndEstado`, `findByTrabajoIdOrderByCreatedAtDesc`, dos paginados `findByInvitadoIdAndEstado[Not]OrderByCreatedAtDesc`); `AsignacionRepository.countByTrabajoIdAndEstado(Long, EstadoAsignacion)`.

- [ ] **Step 1: Crear la entidad**

```java
package com.academconnect.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "solicitud_evaluacion")
@Getter
@Setter
@NoArgsConstructor
public class SolicitudEvaluacion extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trabajo_id", nullable = false)
    private Trabajo trabajo;

    /** Evaluador invitado: profesor o externo. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invitado_id", nullable = false)
    private Usuario invitado;

    @Enumerated(EnumType.STRING)
    @Column(name = "estado", nullable = false, length = 40)
    private EstadoInvitacion estado;

    @Column(name = "motivo", columnDefinition = "text")
    private String motivo;

    @Column(name = "respuesta", columnDefinition = "text")
    private String respuesta;

    @Column(name = "resuelta_en")
    private Instant resueltaEn;
}
```

- [ ] **Step 2: Crear el repositorio**

```java
package com.academconnect.repository;

import com.academconnect.domain.EstadoInvitacion;
import com.academconnect.domain.SolicitudEvaluacion;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SolicitudEvaluacionRepository extends JpaRepository<SolicitudEvaluacion, Long> {

    boolean existsByTrabajoIdAndInvitadoIdAndEstado(Long trabajoId, Long invitadoId, EstadoInvitacion estado);

    long countByTrabajoIdAndEstado(Long trabajoId, EstadoInvitacion estado);

    List<SolicitudEvaluacion> findByTrabajoIdOrderByCreatedAtDesc(Long trabajoId);

    Page<SolicitudEvaluacion> findByInvitadoIdAndEstadoOrderByCreatedAtDesc(
            Long invitadoId, EstadoInvitacion estado, Pageable pageable);

    Page<SolicitudEvaluacion> findByInvitadoIdAndEstadoNotOrderByCreatedAtDesc(
            Long invitadoId, EstadoInvitacion estado, Pageable pageable);
}
```

- [ ] **Step 3: Agregar el count en `AsignacionRepository`**

En `AsignacionRepository.java`, debajo de `long countByEvaluadorIdAndEstado(...)` agregar:

```java
    long countByTrabajoIdAndEstado(Long trabajoId, EstadoAsignacion estado);
```

- [ ] **Step 4: Crear la migración V27 (tabla)**

Crear `src/main/resources/db/migration/V27__solicitud_evaluacion.sql`:

```sql
-- V27__solicitud_evaluacion.sql

-- Solicitud de evaluación: el estudiante invita a un evaluador (profesor o externo).
-- Al aceptar se crea la Asignacion. Flujo invitación + aceptar/rechazar.
CREATE TABLE solicitud_evaluacion (
    id BIGSERIAL PRIMARY KEY,
    trabajo_id BIGINT NOT NULL REFERENCES trabajo(id) ON DELETE CASCADE,
    invitado_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    estado VARCHAR(40) NOT NULL,
    motivo TEXT,
    respuesta TEXT,
    resuelta_en TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    updated_by VARCHAR(100) NOT NULL,
    CONSTRAINT chk_solicitud_evaluacion_estado CHECK (
        estado IN ('PENDIENTE','ACEPTADA','RECHAZADA','CANCELADA')
    )
);

CREATE INDEX ix_solicitud_evaluacion_trabajo ON solicitud_evaluacion (trabajo_id);
CREATE INDEX ix_solicitud_evaluacion_invitado_estado ON solicitud_evaluacion (invitado_id, estado);

-- No invitar dos veces al mismo evaluador con una solicitud pendiente.
CREATE UNIQUE INDEX uq_solicitud_evaluacion_pendiente_invitado
    ON solicitud_evaluacion (trabajo_id, invitado_id)
    WHERE estado = 'PENDIENTE';
```

- [ ] **Step 5: Compilar y validar contexto/Flyway**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest='*Asignacion*'`
Expected: BUILD SUCCESS / PASS (levanta contexto y Flyway aplica V27). Si falla por schema, ajustá la DDL a las columnas exactas de `BaseEntity`.

- [ ] **Step 6: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/domain/SolicitudEvaluacion.java src/main/java/com/academconnect/repository/SolicitudEvaluacionRepository.java src/main/java/com/academconnect/repository/AsignacionRepository.java src/main/resources/db/migration/V27__solicitud_evaluacion.sql
git -C /home/ignacio/Projects/academconnect commit -m "feat(evaluadores): entidad SolicitudEvaluacion, repos y migración"
```

---

## Task 3: DTOs + Mapper (backend)

**Files:**
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/SolicitudEvaluacionRequest.java`
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/SolicitudEvaluacionResponse.java`
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/mapper/SolicitudEvaluacionMapper.java`

**Interfaces:**
- Consumes: `SolicitudEvaluacion` (Task 2).
- Produces: `SolicitudEvaluacionRequest(trabajoId, usuarioId, motivo)`; `SolicitudEvaluacionResponse(id, trabajoId, trabajoTitulo, invitadoId, invitadoNombre, estado, motivo, respuesta, resueltaEn, createdAt)`; `SolicitudEvaluacionMapper.toResponse(...)`. Reusa `RespuestaInvitacionRequest`.

- [ ] **Step 1: Request DTO**

```java
package com.academconnect.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SolicitudEvaluacionRequest(
        @NotNull Long trabajoId,
        @NotNull Long usuarioId,
        @Size(max = 1000) String motivo) {
}
```

- [ ] **Step 2: Response DTO**

```java
package com.academconnect.dto;

import com.academconnect.domain.EstadoInvitacion;
import java.time.Instant;

public record SolicitudEvaluacionResponse(
        Long id,
        Long trabajoId,
        String trabajoTitulo,
        Long invitadoId,
        String invitadoNombre,
        EstadoInvitacion estado,
        String motivo,
        String respuesta,
        Instant resueltaEn,
        Instant createdAt) {
}
```

- [ ] **Step 3: Mapper**

```java
package com.academconnect.mapper;

import com.academconnect.domain.SolicitudEvaluacion;
import com.academconnect.dto.SolicitudEvaluacionResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface SolicitudEvaluacionMapper {

    @Mapping(source = "trabajo.id", target = "trabajoId")
    @Mapping(source = "trabajo.titulo", target = "trabajoTitulo")
    @Mapping(source = "invitado.id", target = "invitadoId")
    @Mapping(source = "invitado.nombre", target = "invitadoNombre")
    SolicitudEvaluacionResponse toResponse(SolicitudEvaluacion entity);
}
```

- [ ] **Step 4: Compilar (genera el mapper)**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q compile`
Expected: BUILD SUCCESS.

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/dto/SolicitudEvaluacionRequest.java src/main/java/com/academconnect/dto/SolicitudEvaluacionResponse.java src/main/java/com/academconnect/mapper/SolicitudEvaluacionMapper.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(evaluadores): DTOs y mapper de SolicitudEvaluacion"
```

---

## Task 4: `SolicitudEvaluacionService` (backend, TDD)

**Files:**
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/service/SolicitudEvaluacionService.java`
- Test: `/home/ignacio/Projects/academconnect/src/test/java/com/academconnect/service/SolicitudEvaluacionServiceTests.java`

**Interfaces:**
- Consumes: Task 2 (entity/repos), Task 3 (DTOs/mapper), Task 1 (`findFirstByEsPorDefectoTrueAndActivoTrue`). `AsignacionService.crear(AsignacionRequest)` → `AsignacionResponse`; `AsignacionRequest(trabajoId, versionamientoId, evaluadorId, templateEvaluacionId, vencimientoEn)`. `VersionamientoRepository.findFirstByTrabajoIdOrderByNumeroVersionDesc(Long)` → `Optional<Versionamiento>`. `TipoTrabajoConfigRepository.findById(TipoTrabajo)` → `Optional<TipoTrabajoConfig>` (`getEvaluadoresDefault()`). `CoorientadorRepository.findByTrabajoId(Long)`. `ConflictoInteresRepository.existsByTrabajoIdAndEvaluadorId(Long, Long)`. `Trabajo.getTipo()`, `EstadoTrabajo` (`EN_DESARROLLO`, `EN_EVALUACION`, `esActivo()`), `EstadoAsignacion.ACTIVA`, `Rol.PROFESOR`/`EXTERNO`.
- Produces: `crear(SolicitudEvaluacionRequest, Long estudianteId)`, `aceptar(Long, RespuestaInvitacionRequest, Long usuarioId)`, `rechazar(Long, RespuestaInvitacionRequest, Long usuarioId)`, `cancelar(Long, Long estudianteId)`, `listarRecibidasPaginadas(Long, boolean, Pageable)`, `listarPorTrabajo(Long)`.

- [ ] **Step 1: Escribir los tests que fallan**

```java
package com.academconnect.service;

import com.academconnect.domain.EstadoAsignacion;
import com.academconnect.domain.EstadoInvitacion;
import com.academconnect.domain.EstadoTrabajo;
import com.academconnect.domain.Estudiante;
import com.academconnect.domain.Externo;
import com.academconnect.domain.Profesor;
import com.academconnect.domain.SolicitudEvaluacion;
import com.academconnect.domain.TemplateEvaluacion;
import com.academconnect.domain.TipoTrabajo;
import com.academconnect.domain.TipoTrabajoConfig;
import com.academconnect.domain.Trabajo;
import com.academconnect.domain.Versionamiento;
import com.academconnect.dto.AsignacionRequest;
import com.academconnect.dto.SolicitudEvaluacionRequest;
import com.academconnect.exception.BusinessException;
import com.academconnect.factories.UsuarioFactory;
import com.academconnect.mapper.SolicitudEvaluacionMapper;
import com.academconnect.repository.AsignacionRepository;
import com.academconnect.repository.CoorientadorRepository;
import com.academconnect.repository.ConflictoInteresRepository;
import com.academconnect.repository.SolicitudEvaluacionRepository;
import com.academconnect.repository.TemplateEvaluacionRepository;
import com.academconnect.repository.TipoTrabajoConfigRepository;
import com.academconnect.repository.TrabajoRepository;
import com.academconnect.repository.UsuarioRepository;
import com.academconnect.repository.VersionamientoRepository;
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
class SolicitudEvaluacionServiceTests {

    @InjectMocks private SolicitudEvaluacionService service;
    @Mock private SolicitudEvaluacionRepository repository;
    @Mock private TrabajoRepository trabajoRepository;
    @Mock private UsuarioRepository usuarioRepository;
    @Mock private AsignacionRepository asignacionRepository;
    @Mock private VersionamientoRepository versionamientoRepository;
    @Mock private TipoTrabajoConfigRepository tipoTrabajoConfigRepository;
    @Mock private TemplateEvaluacionRepository templateRepository;
    @Mock private CoorientadorRepository coorientadorRepository;
    @Mock private ConflictoInteresRepository conflictoRepository;
    @Mock private AsignacionService asignacionService;
    @Mock private SolicitudEvaluacionMapper mapper;

    private Estudiante estudiante;
    private Profesor orientador;
    private Profesor evaluador;
    private Externo evaluadorExterno;
    private Trabajo trabajo;
    private Versionamiento version;
    private TemplateEvaluacion templateDefault;

    @BeforeEach
    void setup() {
        estudiante = UsuarioFactory.createEstudiante(10L, "alumno@x.uy");
        orientador = UsuarioFactory.createProfesor(20L, "orientador@x.uy");
        evaluador = UsuarioFactory.createProfesor(30L, "eval@x.uy");
        evaluadorExterno = UsuarioFactory.createExterno(40L, "ext@x.uy");

        trabajo = new Trabajo();
        trabajo.setId(100L);
        trabajo.setTitulo("Tesis");
        trabajo.setTipo(TipoTrabajo.TCC);
        trabajo.setEstado(EstadoTrabajo.EN_DESARROLLO);
        trabajo.setEstudiante(estudiante);
        trabajo.setOrientador(orientador);

        version = new Versionamiento();
        version.setId(500L);

        templateDefault = new TemplateEvaluacion();
        templateDefault.setId(1L);

        var config = new TipoTrabajoConfig();
        config.setTipo(TipoTrabajo.TCC);
        config.setEvaluadoresDefault(3);

        Mockito.when(trabajoRepository.findById(100L)).thenReturn(Optional.of(trabajo));
        Mockito.when(usuarioRepository.findById(30L)).thenReturn(Optional.of(evaluador));
        Mockito.when(usuarioRepository.findById(40L)).thenReturn(Optional.of(evaluadorExterno));
        Mockito.when(tipoTrabajoConfigRepository.findById(TipoTrabajo.TCC)).thenReturn(Optional.of(config));
        Mockito.when(versionamientoRepository.findFirstByTrabajoIdOrderByNumeroVersionDesc(100L))
                .thenReturn(Optional.of(version));
        Mockito.when(templateRepository.findFirstByEsPorDefectoTrueAndActivoTrue())
                .thenReturn(Optional.of(templateDefault));
        Mockito.when(coorientadorRepository.findByTrabajoId(100L)).thenReturn(List.of());
        Mockito.when(conflictoRepository.existsByTrabajoIdAndEvaluadorId(100L, 30L)).thenReturn(false);
        Mockito.when(asignacionRepository.countByTrabajoIdAndEstado(100L, EstadoAsignacion.ACTIVA)).thenReturn(0L);
        Mockito.when(repository.countByTrabajoIdAndEstado(100L, EstadoInvitacion.PENDIENTE)).thenReturn(0L);
        Mockito.when(repository.existsByTrabajoIdAndInvitadoIdAndEstado(
                Mockito.eq(100L), Mockito.anyLong(), Mockito.eq(EstadoInvitacion.PENDIENTE))).thenReturn(false);
        Mockito.when(repository.save(Mockito.any())).thenAnswer(i -> i.getArgument(0));
    }

    private SolicitudEvaluacionRequest req(Long usuarioId) {
        return new SolicitudEvaluacionRequest(100L, usuarioId, "te invito a evaluar");
    }

    @Test
    void crear_okConProfesor() {
        service.crear(req(30L), estudiante.getId());
        ArgumentCaptor<SolicitudEvaluacion> cap = ArgumentCaptor.forClass(SolicitudEvaluacion.class);
        Mockito.verify(repository).save(cap.capture());
        Assertions.assertEquals(EstadoInvitacion.PENDIENTE, cap.getValue().getEstado());
        Assertions.assertEquals(30L, cap.getValue().getInvitado().getId());
    }

    @Test
    void crear_okConExterno() {
        service.crear(req(40L), estudiante.getId());
        Mockito.verify(repository).save(Mockito.any());
    }

    @Test
    void crear_fallaSiNoEsDueno() {
        Assertions.assertThrows(BusinessException.class, () -> service.crear(req(30L), 999L));
    }

    @Test
    void crear_fallaSinOrientador() {
        trabajo.setOrientador(null);
        Assertions.assertThrows(BusinessException.class, () -> service.crear(req(30L), estudiante.getId()));
    }

    @Test
    void crear_fallaSiFinalizado() {
        trabajo.setEstado(EstadoTrabajo.APROBADO);
        Assertions.assertThrows(BusinessException.class, () -> service.crear(req(30L), estudiante.getId()));
    }

    @Test
    void crear_fallaSinVersion() {
        Mockito.when(versionamientoRepository.findFirstByTrabajoIdOrderByNumeroVersionDesc(100L))
                .thenReturn(Optional.empty());
        Assertions.assertThrows(BusinessException.class, () -> service.crear(req(30L), estudiante.getId()));
    }

    @Test
    void crear_fallaSiBancaCompleta() {
        Mockito.when(asignacionRepository.countByTrabajoIdAndEstado(100L, EstadoAsignacion.ACTIVA)).thenReturn(2L);
        Mockito.when(repository.countByTrabajoIdAndEstado(100L, EstadoInvitacion.PENDIENTE)).thenReturn(1L); // 2+1=3=N
        Assertions.assertThrows(BusinessException.class, () -> service.crear(req(30L), estudiante.getId()));
    }

    @Test
    void crear_fallaSiInvitadoEsOrientador() {
        Mockito.when(usuarioRepository.findById(20L)).thenReturn(Optional.of(orientador));
        Assertions.assertThrows(BusinessException.class, () -> service.crear(req(20L), estudiante.getId()));
    }

    @Test
    void crear_fallaSiConflictoInteres() {
        Mockito.when(conflictoRepository.existsByTrabajoIdAndEvaluadorId(100L, 30L)).thenReturn(true);
        Assertions.assertThrows(BusinessException.class, () -> service.crear(req(30L), estudiante.getId()));
    }

    @Test
    void aceptar_creaAsignacionViaAsignacionService() {
        SolicitudEvaluacion s = new SolicitudEvaluacion();
        s.setId(7L);
        s.setTrabajo(trabajo);
        s.setInvitado(evaluador);
        s.setEstado(EstadoInvitacion.PENDIENTE);
        Mockito.when(repository.findById(7L)).thenReturn(Optional.of(s));

        service.aceptar(7L, null, evaluador.getId());

        Assertions.assertEquals(EstadoInvitacion.ACEPTADA, s.getEstado());
        ArgumentCaptor<AsignacionRequest> cap = ArgumentCaptor.forClass(AsignacionRequest.class);
        Mockito.verify(asignacionService).crear(cap.capture());
        Assertions.assertEquals(100L, cap.getValue().trabajoId());
        Assertions.assertEquals(500L, cap.getValue().versionamientoId());
        Assertions.assertEquals(30L, cap.getValue().evaluadorId());
        Assertions.assertEquals(1L, cap.getValue().templateEvaluacionId());
    }

    @Test
    void aceptar_fallaSiNoEsElInvitado() {
        SolicitudEvaluacion s = new SolicitudEvaluacion();
        s.setId(7L);
        s.setTrabajo(trabajo);
        s.setInvitado(evaluador);
        s.setEstado(EstadoInvitacion.PENDIENTE);
        Mockito.when(repository.findById(7L)).thenReturn(Optional.of(s));
        Assertions.assertThrows(BusinessException.class, () -> service.aceptar(7L, null, 999L));
        Mockito.verify(asignacionService, Mockito.never()).crear(Mockito.any());
    }

    @Test
    void rechazar_marcaRechazadaSinAsignacion() {
        SolicitudEvaluacion s = new SolicitudEvaluacion();
        s.setId(7L);
        s.setTrabajo(trabajo);
        s.setInvitado(evaluador);
        s.setEstado(EstadoInvitacion.PENDIENTE);
        Mockito.when(repository.findById(7L)).thenReturn(Optional.of(s));
        service.rechazar(7L, null, evaluador.getId());
        Assertions.assertEquals(EstadoInvitacion.RECHAZADA, s.getEstado());
        Mockito.verify(asignacionService, Mockito.never()).crear(Mockito.any());
    }

    @Test
    void cancelar_soloDueno() {
        SolicitudEvaluacion s = new SolicitudEvaluacion();
        s.setId(7L);
        s.setTrabajo(trabajo);
        s.setInvitado(evaluador);
        s.setEstado(EstadoInvitacion.PENDIENTE);
        Mockito.when(repository.findById(7L)).thenReturn(Optional.of(s));
        Assertions.assertThrows(BusinessException.class, () -> service.cancelar(7L, 999L));
        service.cancelar(7L, estudiante.getId());
        Assertions.assertEquals(EstadoInvitacion.CANCELADA, s.getEstado());
    }
}
```

> Verificá que `Trabajo` tenga `setTipo(TipoTrabajo)` y `Versionamiento` `setId`/`setNumeroVersion` (Lombok `@Setter`). `UsuarioFactory.createExterno(id,email)` existe. Si algún setter difiere, ajustá el fixture.

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=SolicitudEvaluacionServiceTests`
Expected: FAIL — `SolicitudEvaluacionService` no existe.

- [ ] **Step 3: Implementar el servicio**

```java
package com.academconnect.service;

import com.academconnect.domain.EstadoAsignacion;
import com.academconnect.domain.EstadoInvitacion;
import com.academconnect.domain.Rol;
import com.academconnect.domain.SolicitudEvaluacion;
import com.academconnect.domain.Usuario;
import com.academconnect.dto.AsignacionRequest;
import com.academconnect.dto.RespuestaInvitacionRequest;
import com.academconnect.dto.SolicitudEvaluacionRequest;
import com.academconnect.dto.SolicitudEvaluacionResponse;
import com.academconnect.exception.BusinessException;
import com.academconnect.exception.ResourceNotFoundException;
import com.academconnect.mapper.SolicitudEvaluacionMapper;
import com.academconnect.repository.AsignacionRepository;
import com.academconnect.repository.CoorientadorRepository;
import com.academconnect.repository.ConflictoInteresRepository;
import com.academconnect.repository.SolicitudEvaluacionRepository;
import com.academconnect.repository.TemplateEvaluacionRepository;
import com.academconnect.repository.TipoTrabajoConfigRepository;
import com.academconnect.repository.TrabajoRepository;
import com.academconnect.repository.UsuarioRepository;
import com.academconnect.repository.VersionamientoRepository;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class SolicitudEvaluacionService {

    private final SolicitudEvaluacionRepository repository;
    private final TrabajoRepository trabajoRepository;
    private final UsuarioRepository usuarioRepository;
    private final AsignacionRepository asignacionRepository;
    private final VersionamientoRepository versionamientoRepository;
    private final TipoTrabajoConfigRepository tipoTrabajoConfigRepository;
    private final TemplateEvaluacionRepository templateRepository;
    private final CoorientadorRepository coorientadorRepository;
    private final ConflictoInteresRepository conflictoRepository;
    private final AsignacionService asignacionService;
    private final SolicitudEvaluacionMapper mapper;

    private int evaluadoresRequeridos(com.academconnect.domain.Trabajo trabajo) {
        return tipoTrabajoConfigRepository.findById(trabajo.getTipo())
                .orElseThrow(() -> new BusinessException(
                        "No hay configuración de evaluadores para el tipo " + trabajo.getTipo()))
                .getEvaluadoresDefault();
    }

    private long bancaOcupada(Long trabajoId) {
        return asignacionRepository.countByTrabajoIdAndEstado(trabajoId, EstadoAsignacion.ACTIVA)
                + repository.countByTrabajoIdAndEstado(trabajoId, EstadoInvitacion.PENDIENTE);
    }

    @Transactional
    public SolicitudEvaluacionResponse crear(SolicitudEvaluacionRequest request, Long estudianteId) {
        var trabajo = trabajoRepository.findById(request.trabajoId())
                .orElseThrow(() -> new ResourceNotFoundException("Trabajo", request.trabajoId()));
        if (trabajo.getEstudiante() == null || !trabajo.getEstudiante().getId().equals(estudianteId)) {
            throw new BusinessException("No sos el dueño de este trabajo");
        }
        if (trabajo.getOrientador() == null) {
            throw new BusinessException("El trabajo aún no tiene orientador");
        }
        if (!trabajo.getEstado().esActivo()) {
            throw new BusinessException("No se puede solicitar evaluadores en un trabajo finalizado");
        }
        if (versionamientoRepository.findFirstByTrabajoIdOrderByNumeroVersionDesc(trabajo.getId()).isEmpty()) {
            throw new BusinessException("El trabajo no tiene ninguna versión para evaluar");
        }
        int n = evaluadoresRequeridos(trabajo);
        if (bancaOcupada(trabajo.getId()) >= n) {
            throw new BusinessException("La banca evaluadora ya está completa");
        }
        var invitado = usuarioRepository.findById(request.usuarioId())
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", request.usuarioId()));
        if (!invitado.isActivo()) {
            throw new BusinessException("El usuario no está activo");
        }
        if (invitado.getRol() != Rol.PROFESOR && invitado.getRol() != Rol.EXTERNO) {
            throw new BusinessException("El evaluador debe ser un profesor o un externo");
        }
        if (invitado.getId().equals(trabajo.getOrientador().getId())) {
            throw new BusinessException("El evaluador no puede ser el orientador");
        }
        if (invitado.getId().equals(estudianteId)) {
            throw new BusinessException("No podés invitarte a vos mismo");
        }
        boolean esCoorientador = coorientadorRepository.findByTrabajoId(trabajo.getId()).stream()
                .anyMatch(c -> c.getUsuario().getId().equals(invitado.getId()));
        if (esCoorientador) {
            throw new BusinessException("El coorientador no puede ser evaluador");
        }
        if (conflictoRepository.existsByTrabajoIdAndEvaluadorId(trabajo.getId(), invitado.getId())) {
            throw new BusinessException("El evaluador tiene conflicto de interés con este trabajo");
        }
        if (repository.existsByTrabajoIdAndInvitadoIdAndEstado(
                trabajo.getId(), invitado.getId(), EstadoInvitacion.PENDIENTE)) {
            throw new BusinessException("Ya hay una solicitud pendiente para este evaluador");
        }
        if (asignacionRepository.findByTrabajoId(trabajo.getId()).stream()
                .anyMatch(a -> a.getEvaluador().getId().equals(invitado.getId())
                        && a.getEstado() == EstadoAsignacion.ACTIVA)) {
            throw new BusinessException("Este evaluador ya está asignado al trabajo");
        }

        var solicitud = new SolicitudEvaluacion();
        solicitud.setTrabajo(trabajo);
        solicitud.setInvitado(invitado);
        solicitud.setEstado(EstadoInvitacion.PENDIENTE);
        solicitud.setMotivo(request.motivo());
        return mapper.toResponse(repository.save(solicitud));
    }

    @Transactional
    public SolicitudEvaluacionResponse aceptar(
            Long solicitudId, RespuestaInvitacionRequest request, Long usuarioId) {
        var s = repository.findById(solicitudId)
                .orElseThrow(() -> new ResourceNotFoundException("SolicitudEvaluacion", solicitudId));
        if (!s.getInvitado().getId().equals(usuarioId)) {
            throw new BusinessException("Solo el evaluador invitado puede aceptar");
        }
        if (s.getEstado() != EstadoInvitacion.PENDIENTE) {
            throw new BusinessException("La solicitud ya fue resuelta");
        }
        var trabajo = s.getTrabajo();
        if (trabajo.getOrientador() == null || !trabajo.getEstado().esActivo()) {
            throw new BusinessException("La solicitud ya no es válida para este trabajo");
        }
        int n = evaluadoresRequeridos(trabajo);
        if (asignacionRepository.countByTrabajoIdAndEstado(trabajo.getId(), EstadoAsignacion.ACTIVA) >= n) {
            throw new BusinessException("La banca evaluadora ya está completa");
        }
        var version = versionamientoRepository.findFirstByTrabajoIdOrderByNumeroVersionDesc(trabajo.getId())
                .orElseThrow(() -> new BusinessException("El trabajo no tiene ninguna versión para evaluar"));
        var template = templateRepository.findFirstByEsPorDefectoTrueAndActivoTrue()
                .orElseThrow(() -> new BusinessException("No hay un template de evaluación por defecto configurado"));

        asignacionService.crear(new AsignacionRequest(
                trabajo.getId(), version.getId(), s.getInvitado().getId(), template.getId(), null));

        s.setEstado(EstadoInvitacion.ACEPTADA);
        s.setRespuesta(request != null ? request.respuesta() : null);
        s.setResueltaEn(Instant.now());
        return mapper.toResponse(repository.save(s));
    }

    @Transactional
    public SolicitudEvaluacionResponse rechazar(
            Long solicitudId, RespuestaInvitacionRequest request, Long usuarioId) {
        var s = repository.findById(solicitudId)
                .orElseThrow(() -> new ResourceNotFoundException("SolicitudEvaluacion", solicitudId));
        if (!s.getInvitado().getId().equals(usuarioId)) {
            throw new BusinessException("Solo el evaluador invitado puede rechazar");
        }
        if (s.getEstado() != EstadoInvitacion.PENDIENTE) {
            throw new BusinessException("La solicitud ya fue resuelta");
        }
        s.setEstado(EstadoInvitacion.RECHAZADA);
        s.setRespuesta(request != null ? request.respuesta() : null);
        s.setResueltaEn(Instant.now());
        return mapper.toResponse(repository.save(s));
    }

    @Transactional
    public SolicitudEvaluacionResponse cancelar(Long solicitudId, Long estudianteId) {
        var s = repository.findById(solicitudId)
                .orElseThrow(() -> new ResourceNotFoundException("SolicitudEvaluacion", solicitudId));
        if (s.getTrabajo().getEstudiante() == null
                || !s.getTrabajo().getEstudiante().getId().equals(estudianteId)) {
            throw new BusinessException("Solo el dueño puede cancelar");
        }
        if (s.getEstado() != EstadoInvitacion.PENDIENTE) {
            throw new BusinessException("La solicitud ya fue resuelta");
        }
        s.setEstado(EstadoInvitacion.CANCELADA);
        s.setResueltaEn(Instant.now());
        return mapper.toResponse(repository.save(s));
    }

    public Page<SolicitudEvaluacionResponse> listarRecibidasPaginadas(
            Long usuarioId, boolean soloPendientes, Pageable pageable) {
        Page<SolicitudEvaluacion> page = soloPendientes
                ? repository.findByInvitadoIdAndEstadoOrderByCreatedAtDesc(
                        usuarioId, EstadoInvitacion.PENDIENTE, pageable)
                : repository.findByInvitadoIdAndEstadoNotOrderByCreatedAtDesc(
                        usuarioId, EstadoInvitacion.PENDIENTE, pageable);
        return page.map(mapper::toResponse);
    }

    public List<SolicitudEvaluacionResponse> listarPorTrabajo(Long trabajoId) {
        if (!trabajoRepository.existsById(trabajoId)) {
            throw new ResourceNotFoundException("Trabajo", trabajoId);
        }
        return repository.findByTrabajoIdOrderByCreatedAtDesc(trabajoId)
                .stream().map(mapper::toResponse).toList();
    }
}
```

> `EstadoTrabajo.esActivo()` ya existe (true salvo APROBADO/RECHAZADO/CANCELADO). No publicamos `ActividadEvent` propio (la creación de la `Asignacion` ya dispara `ASIGNACION_CREADA` dentro de `AsignacionService.crear`).

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=SolicitudEvaluacionServiceTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/service/SolicitudEvaluacionService.java src/test/java/com/academconnect/service/SolicitudEvaluacionServiceTests.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(evaluadores): servicio de solicitud de evaluación"
```

---

## Task 5: Controller + recomendador dueño-only

**Files:**
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/controller/SolicitudEvaluacionController.java`
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/SugerenciaBancaResponse.java`
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/controller/MeTrabajoController.java`

**Interfaces:**
- Consumes: Task 4 (servicio), DTOs (Task 3), `UsuarioRepository`. `RecomendadorService.sugerirRevisores(Long, int)` → `List<SugerenciaEvaluadorResponse>`. `TipoTrabajoConfigRepository`, `TrabajoRepository`.
- Produces: endpoints `/api/solicitudes-evaluacion/*`; `GET /api/me/trabajos/{id}/sugerir-evaluadores` → `SugerenciaBancaResponse(evaluadoresRequeridos, sugerencias)`.

- [ ] **Step 1: DTO de respuesta del recomendador (con N)**

```java
package com.academconnect.dto;

import java.util.List;

public record SugerenciaBancaResponse(
        int evaluadoresRequeridos,
        List<SugerenciaEvaluadorResponse> sugerencias) {
}
```

- [ ] **Step 2: Crear el controller de solicitudes**

```java
package com.academconnect.controller;

import com.academconnect.domain.EstadoInvitacion;
import com.academconnect.dto.RespuestaInvitacionRequest;
import com.academconnect.dto.SolicitudEvaluacionRequest;
import com.academconnect.dto.SolicitudEvaluacionResponse;
import com.academconnect.exception.ResourceNotFoundException;
import com.academconnect.repository.UsuarioRepository;
import com.academconnect.service.SolicitudEvaluacionService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/solicitudes-evaluacion")
@RequiredArgsConstructor
public class SolicitudEvaluacionController {

    private final SolicitudEvaluacionService service;
    private final UsuarioRepository usuarioRepository;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ESTUDIANTE')")
    public SolicitudEvaluacionResponse crear(
            @Valid @RequestBody SolicitudEvaluacionRequest request, Authentication authn) {
        return service.crear(request, currentUserId(authn));
    }

    @PostMapping("/{id}/aceptar")
    @PreAuthorize("hasRole('PROFESOR') or hasRole('EXTERNO')")
    public SolicitudEvaluacionResponse aceptar(
            @PathVariable Long id,
            @RequestBody(required = false) RespuestaInvitacionRequest request,
            Authentication authn) {
        return service.aceptar(id, request, currentUserId(authn));
    }

    @PostMapping("/{id}/rechazar")
    @PreAuthorize("hasRole('PROFESOR') or hasRole('EXTERNO')")
    public SolicitudEvaluacionResponse rechazar(
            @PathVariable Long id,
            @RequestBody(required = false) RespuestaInvitacionRequest request,
            Authentication authn) {
        return service.rechazar(id, request, currentUserId(authn));
    }

    @PostMapping("/{id}/cancelar")
    @PreAuthorize("hasRole('ESTUDIANTE')")
    public SolicitudEvaluacionResponse cancelar(@PathVariable Long id, Authentication authn) {
        return service.cancelar(id, currentUserId(authn));
    }

    @GetMapping
    @PreAuthorize("hasRole('PROFESOR') or hasRole('EXTERNO')")
    public Page<SolicitudEvaluacionResponse> recibidas(
            @RequestParam(required = false) EstadoInvitacion estado,
            @PageableDefault(size = 10, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable,
            Authentication authn) {
        return service.listarRecibidasPaginadas(
                currentUserId(authn), estado == EstadoInvitacion.PENDIENTE, pageable);
    }

    @GetMapping("/trabajos/{trabajoId}")
    @PreAuthorize("isAuthenticated()")
    public List<SolicitudEvaluacionResponse> porTrabajo(@PathVariable Long trabajoId) {
        return service.listarPorTrabajo(trabajoId);
    }

    private Long currentUserId(Authentication authn) {
        var email = authn.getName();
        return usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario con email", email))
                .getId();
    }
}
```

- [ ] **Step 3: Endpoint dueño-only del recomendador en `MeTrabajoController`**

Leé `MeTrabajoController.java` (ya tiene `service` = `TrabajoService`, `currentUserId(authn)`, y el patrón de dueño de `buscarPorId`/`sugerirOrientadores`). Agregá los campos:

```java
    private final com.academconnect.service.RecomendadorService recomendadorService;
    private final com.academconnect.repository.TipoTrabajoConfigRepository tipoTrabajoConfigRepository;
    private final com.academconnect.repository.TrabajoRepository trabajoRepository;
```

Y el endpoint (después de `sugerirOrientadores`):

```java
    @GetMapping("/{id}/sugerir-evaluadores")
    @PreAuthorize("hasRole('ESTUDIANTE')")
    public com.academconnect.dto.SugerenciaBancaResponse sugerirEvaluadores(
            @PathVariable Long id, Authentication authn) {
        var trabajo = service.buscarPorId(id);
        if (trabajo.estudianteId() == null || !trabajo.estudianteId().equals(currentUserId(authn))) {
            throw new ResourceNotFoundException("Trabajo", id);
        }
        var entidad = trabajoRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Trabajo", id));
        int n = tipoTrabajoConfigRepository.findById(entidad.getTipo())
                .map(c -> c.getEvaluadoresDefault())
                .orElse(3);
        return new com.academconnect.dto.SugerenciaBancaResponse(
                n, recomendadorService.sugerirRevisores(id, n));
    }
```

> Verificá el nombre real del getter de id de estudiante en `TrabajoResponse` (en `sugerirOrientadores` ya se usa `trabajo.estudianteId()`). Si `MeTrabajoController` ya tiene inyectado `trabajoRepository`/otro, no lo dupliques; reusá el existente.

- [ ] **Step 4: Compilar y correr tests de evaluación (regresión)**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest='*SolicitudEvaluacion*,*MeTrabajo*'`
Expected: BUILD SUCCESS / PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/controller/SolicitudEvaluacionController.java src/main/java/com/academconnect/dto/SugerenciaBancaResponse.java src/main/java/com/academconnect/controller/MeTrabajoController.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(evaluadores): endpoints de solicitud y recomendador dueño-only"
```

---

## Task 6: Servicio + modelos frontend (TDD)

**Files:**
- Create: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/solicitud-evaluacion.models.ts`
- Create: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/solicitud-evaluacion.service.ts`
- Test: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/solicitud-evaluacion.service.spec.ts`

**Interfaces:**
- Produces: `SolicitudEvaluacionService` (`crear`, `aceptar`, `rechazar`, `cancelar`, `listarRecibidas`, `listarPorTrabajo`, `sugerirEvaluadores`); modelos `SolicitudEvaluacion`, `SolicitudEvaluacionRequest`, `EvaluadorSugerido`, `SugerenciaBanca`.

- [ ] **Step 1: Modelos**

```typescript
import { EstadoInvitacion } from './invitacion-orientacion.models';

export interface SolicitudEvaluacion {
  id: number;
  trabajoId: number;
  trabajoTitulo: string;
  invitadoId: number;
  invitadoNombre: string;
  estado: EstadoInvitacion;
  motivo: string | null;
  respuesta: string | null;
  resueltaEn: string | null;
  createdAt: string;
}

export interface SolicitudEvaluacionRequest {
  trabajoId: number;
  usuarioId: number;
  motivo?: string | null;
}

export interface EvaluadorSugerido {
  evaluadorId: number;
  nombre: string;
  email: string;
  rol: 'PROFESOR' | 'EXTERNO';
  score: number;
  afinidad: number;
  cargaNorm: number;
  disponibilidad: number;
}

export interface SugerenciaBanca {
  evaluadoresRequeridos: number;
  sugerencias: EvaluadorSugerido[];
}
```

- [ ] **Step 2: Escribir el test que falla**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SolicitudEvaluacionService } from './solicitud-evaluacion.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('SolicitudEvaluacionService', () => {
  let service: SolicitudEvaluacionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SolicitudEvaluacionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('crear pega POST a /api/solicitudes-evaluacion', () => {
    service.crear({ trabajoId: 7, usuarioId: 30, motivo: 'x' }).subscribe();
    const req = http.expectOne(`${api}/api/solicitudes-evaluacion`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('sugerirEvaluadores pega a /api/me/trabajos/{id}/sugerir-evaluadores', () => {
    let res: { evaluadoresRequeridos: number } | undefined;
    service.sugerirEvaluadores(7).subscribe((r) => (res = r));
    const req = http.expectOne(`${api}/api/me/trabajos/7/sugerir-evaluadores`);
    expect(req.request.method).toBe('GET');
    req.flush({ evaluadoresRequeridos: 3, sugerencias: [] });
    expect(res?.evaluadoresRequeridos).toBe(3);
  });

  it('listarPorTrabajo pega a /trabajos/{id}', () => {
    service.listarPorTrabajo(7).subscribe();
    http.expectOne(`${api}/api/solicitudes-evaluacion/trabajos/7`).flush([]);
  });
});
```

- [ ] **Step 3: Correr el test (falla o runner-unavailable)**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --watch=false --include='**/solicitud-evaluacion.service.spec.ts'`
Si el runner browser no está, registrá el error y seguí con el typecheck (Step 5).

- [ ] **Step 4: Implementar el servicio**

```typescript
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Page } from '@core/http/page';
import { RespuestaInvitacionRequest, EstadoInvitacion } from './invitacion-orientacion.models';
import {
  SolicitudEvaluacion,
  SolicitudEvaluacionRequest,
  SugerenciaBanca,
} from './solicitud-evaluacion.models';

@Injectable({ providedIn: 'root' })
export class SolicitudEvaluacionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;
  private readonly base = `${this.api}/api/solicitudes-evaluacion`;

  crear(payload: SolicitudEvaluacionRequest): Observable<SolicitudEvaluacion> {
    return this.http.post<SolicitudEvaluacion>(this.base, payload);
  }

  aceptar(id: number, body?: RespuestaInvitacionRequest): Observable<SolicitudEvaluacion> {
    return this.http.post<SolicitudEvaluacion>(`${this.base}/${id}/aceptar`, body ?? {});
  }

  rechazar(id: number, body?: RespuestaInvitacionRequest): Observable<SolicitudEvaluacion> {
    return this.http.post<SolicitudEvaluacion>(`${this.base}/${id}/rechazar`, body ?? {});
  }

  cancelar(id: number): Observable<SolicitudEvaluacion> {
    return this.http.post<SolicitudEvaluacion>(`${this.base}/${id}/cancelar`, {});
  }

  listarRecibidas(
    estado: EstadoInvitacion | undefined, page: number, size: number,
  ): Observable<Page<SolicitudEvaluacion>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (estado) params = params.set('estado', estado);
    return this.http.get<Page<SolicitudEvaluacion>>(this.base, { params });
  }

  listarPorTrabajo(trabajoId: number): Observable<SolicitudEvaluacion[]> {
    return this.http.get<SolicitudEvaluacion[]>(`${this.base}/trabajos/${trabajoId}`);
  }

  sugerirEvaluadores(trabajoId: number): Observable<SugerenciaBanca> {
    return this.http.get<SugerenciaBanca>(
      `${this.api}/api/me/trabajos/${trabajoId}/sugerir-evaluadores`);
  }
}
```

> Verificá que `RespuestaInvitacionRequest`/`EstadoInvitacion` estén exportados desde `invitacion-orientacion.models`.

- [ ] **Step 5: Verificar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit`
Expected: cero errores.

- [ ] **Step 6: Commit**

```bash
git -C /home/ignacio/Projects/academconnect-web add src/app/features/mis-trabajos/solicitud-evaluacion.models.ts src/app/features/mis-trabajos/solicitud-evaluacion.service.ts src/app/features/mis-trabajos/solicitud-evaluacion.service.spec.ts
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(evaluadores): servicio y modelos frontend"
```

---

## Task 7: Form de banca + integración en el detalle (frontend)

**Files:**
- Create: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/components/solicitar-evaluadores-form/solicitar-evaluadores-form.ts`
- Create: `.../solicitar-evaluadores-form/solicitar-evaluadores-form.html`
- Create: `.../solicitar-evaluadores-form/solicitar-evaluadores-form.scss`
- Test: `.../solicitar-evaluadores-form/solicitar-evaluadores-form.spec.ts`
- Modify: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/mis-trabajos-detalle-page/mis-trabajos-detalle-page.ts`
- Modify: `.../mis-trabajos-detalle-page/mis-trabajos-detalle-page.html`

**Interfaces:**
- Consumes: Task 6 (`SolicitudEvaluacionService`, `EvaluadorSugerido`, `SolicitudEvaluacion`).
- Produces: componente `ac-solicitar-evaluadores-form` con `input.required<number>() trabajoId`, `input.required<number>() orientadorId`, `input<number[]>() excluidos` (ids ya invitados/asignados/coorientador), `input<boolean>() submitting`, `output<{usuarioId:number; motivo:string|null}>() enviar`.

- [ ] **Step 1: Escribir el spec del form (falla)**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SolicitarEvaluadoresForm } from './solicitar-evaluadores-form';
import { environment } from '@env/environment';

const api = environment.apiBase;

const BANCA = {
  evaluadoresRequeridos: 3,
  sugerencias: [
    { evaluadorId: 30, nombre: 'Eval A', email: 'a@x', rol: 'PROFESOR', score: 0.8, afinidad: 0.8, cargaNorm: 0.2, disponibilidad: 1 },
    { evaluadorId: 20, nombre: 'Orientador', email: 'o@x', rol: 'PROFESOR', score: 0.5, afinidad: 0.5, cargaNorm: 0.1, disponibilidad: 1 },
    { evaluadorId: 40, nombre: 'Eval B', email: 'b@x', rol: 'EXTERNO', score: 0.4, afinidad: 0.3, cargaNorm: 0.3, disponibilidad: 1 },
  ],
};

describe('SolicitarEvaluadoresForm', () => {
  let fixture: ComponentFixture<SolicitarEvaluadoresForm>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SolicitarEvaluadoresForm],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SolicitarEvaluadoresForm);
    fixture.componentRef.setInput('trabajoId', 7);
    fixture.componentRef.setInput('orientadorId', 20);
    fixture.componentRef.setInput('excluidos', [40]);
    fixture.detectChanges();
    http.expectOne(`${api}/api/me/trabajos/7/sugerir-evaluadores`).flush(BANCA);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('excluye al orientador y a los excluidos de los candidatos', () => {
    const items = fixture.nativeElement.querySelectorAll('.eval-form__item');
    expect(items.length).toBe(1); // 30; 20 (orientador) y 40 (excluido) fuera
    expect(items[0].textContent).toContain('Eval A');
  });

  it('al seleccionar y enviar emite { usuarioId, motivo }', () => {
    const cmp = fixture.componentInstance as unknown as {
      seleccionar: (id: number) => void; onSubmit: () => void;
      enviar: { subscribe: (cb: (v: { usuarioId: number; motivo: string | null }) => void) => void };
    };
    let emitted: { usuarioId: number; motivo: string | null } | undefined;
    cmp.enviar.subscribe((v) => (emitted = v));
    cmp.seleccionar(30);
    cmp.onSubmit();
    expect(emitted).toEqual({ usuarioId: 30, motivo: null });
  });
});
```

- [ ] **Step 2: Correr el spec (falla o runner-unavailable)**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --watch=false --include='**/solicitar-evaluadores-form.spec.ts'`

- [ ] **Step 3: Crear el componente TS**

```typescript
import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { SolicitudEvaluacionService } from '../../solicitud-evaluacion.service';
import { EvaluadorSugerido } from '../../solicitud-evaluacion.models';

@Component({
  selector: 'ac-solicitar-evaluadores-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button],
  templateUrl: './solicitar-evaluadores-form.html',
  styleUrl: './solicitar-evaluadores-form.scss',
})
export class SolicitarEvaluadoresForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SolicitudEvaluacionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly trabajoId = input.required<number>();
  readonly orientadorId = input.required<number>();
  readonly excluidos = input<number[]>([]);
  readonly submitting = input<boolean>(false);
  readonly enviar = output<{ usuarioId: number; motivo: string | null }>();

  protected readonly sugerencias = signal<EvaluadorSugerido[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly query = signal<string>('');

  protected readonly form = this.fb.nonNullable.group({
    usuarioId: [null as number | null, Validators.required],
    motivo: [''],
  });

  protected readonly candidatos = computed(() => {
    const q = this.query().trim().toLowerCase();
    const fuera = new Set<number>([this.orientadorId(), ...this.excluidos()]);
    const base = this.sugerencias().filter((e) => !fuera.has(e.evaluadorId));
    return q ? base.filter((e) => e.nombre.toLowerCase().includes(q)) : base;
  });

  ngOnInit(): void {
    this.service.sugerirEvaluadores(this.trabajoId())
      .pipe(catchError(() => of({ evaluadoresRequeridos: 0, sugerencias: [] })),
            takeUntilDestroyed(this.destroyRef))
      .subscribe((b) => { this.sugerencias.set(b.sugerencias); this.loading.set(false); });
  }

  protected seleccionar(id: number): void {
    this.form.controls.usuarioId.setValue(id);
  }

  protected onQuery(value: string): void {
    this.query.set(value);
  }

  protected onSubmit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.enviar.emit({ usuarioId: v.usuarioId!, motivo: v.motivo.trim() || null });
  }
}
```

- [ ] **Step 4: Crear el template HTML**

```html
<form class="eval-form" [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>
  @if (loading()) {
    <span class="eval-form__hint" role="status">Cargando evaluadores recomendados…</span>
  } @else {
    <fieldset class="eval-form__field">
      <legend class="eval-form__label">Elegí un evaluador</legend>
      <input type="search" class="eval-form__search" placeholder="Buscar por nombre…"
             aria-label="Buscar evaluador por nombre"
             [value]="query()" (input)="onQuery($any($event.target).value)" />
      <ul class="eval-form__list">
        @for (e of candidatos(); track e.evaluadorId) {
          <li class="eval-form__item">
            <label class="eval-form__item-label">
              <input type="radio" formControlName="usuarioId" [value]="e.evaluadorId" (change)="seleccionar(e.evaluadorId)" />
              <span class="eval-form__item-nombre">{{ e.nombre }}</span>
              <span class="eval-form__item-rol">{{ e.rol === 'PROFESOR' ? 'Profesor' : 'Externo' }}</span>
            </label>
          </li>
        } @empty {
          <li class="eval-form__hint">No hay evaluadores que coincidan.</li>
        }
      </ul>
    </fieldset>
  }

  <label class="eval-form__field">
    <span class="eval-form__label">Mensaje (opcional)</span>
    <textarea formControlName="motivo" rows="3" maxlength="1000"
              class="eval-form__textarea"
              placeholder="Contale por qué lo invitás a evaluar tu trabajo."></textarea>
  </label>

  <div class="eval-form__actions">
    <ac-button size="sm" type="submit" [loading]="submitting()"
               [disabled]="submitting() || form.invalid">Enviar solicitud</ac-button>
  </div>
</form>
```

- [ ] **Step 5: Crear el SCSS**

```scss
.eval-form__list { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow-y: auto; }
.eval-form__item-rol { margin-inline-start: 0.5rem; font-size: 0.85em; opacity: 0.7; }
```

- [ ] **Step 6: Integrar en el detalle del trabajo**

En `mis-trabajos-detalle-page.ts`:
- Imports:
```typescript
import { SolicitarEvaluadoresForm } from '../components/solicitar-evaluadores-form/solicitar-evaluadores-form';
import { SolicitudEvaluacionService } from '../solicitud-evaluacion.service';
import { SolicitudEvaluacion } from '../solicitud-evaluacion.models';
```
- Agregar `SolicitarEvaluadoresForm` al array `imports` del `@Component`.
- Inyectar y estado:
```typescript
  private readonly evaluacionService = inject(SolicitudEvaluacionService);
  protected readonly solicitudesEvaluacion = signal<SolicitudEvaluacion[]>([]);
  protected readonly evaluadoresRequeridos = signal<number>(0);
  protected readonly submittingEval = signal<boolean>(false);
```
- Computeds:
```typescript
  protected readonly evalAceptados = computed(() =>
    this.solicitudesEvaluacion().filter((s) => s.estado === 'ACEPTADA').length);
  protected readonly evalPendientes = computed(() =>
    this.solicitudesEvaluacion().filter((s) => s.estado === 'PENDIENTE').length);
  protected readonly bancaExcluidos = computed(() =>
    this.solicitudesEvaluacion()
      .filter((s) => s.estado === 'PENDIENTE' || s.estado === 'ACEPTADA')
      .map((s) => s.invitadoId));
  protected readonly puedeSolicitarEvaluadores = computed(() => {
    const t = this.trabajo();
    if (!t || t.orientadorId == null) return false;
    if (t.estado !== 'EN_DESARROLLO' && t.estado !== 'EN_EVALUACION') return false;
    const n = this.evaluadoresRequeridos();
    return n > 0 && (this.evalAceptados() + this.evalPendientes()) < n;
  });
```
- En la carga del detalle (`forkJoin`/subscribe), agregar:
  `evaluaciones: this.evaluacionService.listarPorTrabajo(id).pipe(catchError(() => of<SolicitudEvaluacion[]>([])))`
  y en el subscribe `this.solicitudesEvaluacion.set(evaluaciones);`. Además, una sola vez al cargar (si el trabajo tiene orientador), pedir el N:
  `this.evaluacionService.sugerirEvaluadores(id).pipe(catchError(() => of({ evaluadoresRequeridos: 0, sugerencias: [] })), takeUntilDestroyed(this.destroyRef)).subscribe((b) => this.evaluadoresRequeridos.set(b.evaluadoresRequeridos));`
- Handler:
```typescript
  protected onSolicitarEvaluador(payload: { usuarioId: number; motivo: string | null }): void {
    const t = this.trabajo();
    if (!t) return;
    this.submittingEval.set(true);
    this.evaluacionService.crear({ trabajoId: t.id, usuarioId: payload.usuarioId, motivo: payload.motivo })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => { this.submittingEval.set(false); this.solicitudesEvaluacion.update((p) => [s, ...p]); },
        error: () => { this.submittingEval.set(false); },
      });
  }
```

En `mis-trabajos-detalle-page.html`, después del bloque de coorientador (dentro del `@if (trabajo(); as t)`), agregar:
```html
    @if (t.orientadorId != null && (t.estado === 'EN_DESARROLLO' || t.estado === 'EN_EVALUACION')) {
      <ac-card padding="md">
        <h2 class="detalle__h2">Banca evaluadora</h2>
        <p class="detalle__hint">
          Necesitás {{ evaluadoresRequeridos() }} · Aceptados {{ evalAceptados() }} · Pendientes {{ evalPendientes() }}
        </p>
        @if (puedeSolicitarEvaluadores()) {
          <ac-solicitar-evaluadores-form
            [trabajoId]="t.id"
            [orientadorId]="t.orientadorId!"
            [excluidos]="bancaExcluidos()"
            [submitting]="submittingEval()"
            (enviar)="onSolicitarEvaluador($event)" />
        } @else {
          <p class="detalle__hint">Banca completa.</p>
        }
      </ac-card>
    }
```
> CUIDADO: corregí el typo — el estado es `'EN_EVALUACION'` (no `'EN_EVALUACion'`). Usá `t.estado === 'EN_DESARROLLO' || t.estado === 'EN_EVALUACION'`. Verificá el nombre real de la variable del `@if (trabajo(); as t)` y que `TrabajoListItem` tenga `orientadorId` y `estado` con esos literales.

- [ ] **Step 7: Verificar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit`
Expected: cero errores.

- [ ] **Step 8: Commit**

```bash
git -C /home/ignacio/Projects/academconnect-web add src/app/features/mis-trabajos/components/solicitar-evaluadores-form/ src/app/features/mis-trabajos/mis-trabajos-detalle-page/
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(evaluadores): bloque de banca evaluadora en el detalle"
```

---

## Task 8: Página de solicitudes de evaluación recibidas (frontend)

**Files:**
- Create: `/home/ignacio/Projects/academconnect-web/src/app/features/evaluaciones/solicitudes-evaluacion-page/solicitudes-evaluacion-page.ts`
- Create: `.../solicitudes-evaluacion-page/solicitudes-evaluacion-page.html`
- Create: `.../solicitudes-evaluacion-page/solicitudes-evaluacion-page.scss`
- Modify: `/home/ignacio/Projects/academconnect-web/src/app/features/evaluaciones/evaluaciones.routes.ts` (o el archivo de rutas donde vive la cola del evaluador)
- Modify: `/home/ignacio/Projects/academconnect-web/src/app/layout/sidebar/sidebar.ts`

**Interfaces:**
- Consumes: Task 6 (`SolicitudEvaluacionService`, `SolicitudEvaluacion`).

- [ ] **Step 1: Crear la página TS** (mismo patrón que `coorientaciones-recibidas-page`, con el servicio de evaluación)

```typescript
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { isProblemDetail } from '@core/http/problem-detail';
import { SolicitudEvaluacionService } from '@features/mis-trabajos/solicitud-evaluacion.service';
import { SolicitudEvaluacion } from '@features/mis-trabajos/solicitud-evaluacion.models';

type Filtro = 'PENDIENTE' | 'HISTORICO';
const PAGE_SIZE = 10;

@Component({
  selector: 'ac-solicitudes-evaluacion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card],
  templateUrl: './solicitudes-evaluacion-page.html',
  styleUrl: './solicitudes-evaluacion-page.scss',
})
export class SolicitudesEvaluacionPage {
  private readonly service = inject(SolicitudEvaluacionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly solicitudes = signal<SolicitudEvaluacion[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionId = signal<number | null>(null);
  protected readonly filtro = signal<Filtro>('PENDIENTE');

  protected readonly page = signal<number>(0);
  protected readonly first = signal<boolean>(true);
  protected readonly last = signal<boolean>(true);

  constructor() { this.cargar(); }

  protected setFiltro(f: Filtro): void {
    if (this.filtro() === f) return;
    this.filtro.set(f);
    this.page.set(0);
    this.cargar();
  }

  protected paginaAnterior(): void {
    if (this.first() || this.loading()) return;
    this.page.update((p) => p - 1);
    this.cargar();
  }

  protected paginaSiguiente(): void {
    if (this.last() || this.loading()) return;
    this.page.update((p) => p + 1);
    this.cargar();
  }

  protected aceptar(s: SolicitudEvaluacion): void {
    this.actionId.set(s.id);
    this.service.aceptar(s.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.actionId.set(null); this.cargar(); },
        error: (err: HttpErrorResponse) => { this.actionId.set(null); this.error.set(this.mapError(err)); },
      });
  }

  protected rechazar(s: SolicitudEvaluacion): void {
    this.actionId.set(s.id);
    this.service.rechazar(s.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.actionId.set(null); this.cargar(); },
        error: (err: HttpErrorResponse) => { this.actionId.set(null); this.error.set(this.mapError(err)); },
      });
  }

  private cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    const estado = this.filtro() === 'PENDIENTE' ? 'PENDIENTE' : undefined;
    this.service.listarRecibidas(estado, this.page(), PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          if (p.content.length === 0 && p.number > 0) {
            this.page.set(p.number - 1);
            this.cargar();
            return;
          }
          this.solicitudes.set(p.content);
          this.first.set(p.first);
          this.last.set(p.last);
          this.page.set(p.number);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => { this.error.set(this.mapError(err)); this.loading.set(false); },
      });
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Sin conexión.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return 'No se pudo completar la acción.';
  }
}
```

- [ ] **Step 2: Template HTML**

```html
<section class="sol-eval">
  <header class="sol-eval__header">
    <h1 class="sol-eval__title">Solicitudes de evaluación</h1>
    <div class="sol-eval__tabs" role="tablist">
      <ac-button size="sm" [variant]="filtro() === 'PENDIENTE' ? 'primary' : 'ghost'"
                 (click)="setFiltro('PENDIENTE')">Pendientes</ac-button>
      <ac-button size="sm" [variant]="filtro() === 'HISTORICO' ? 'primary' : 'ghost'"
                 (click)="setFiltro('HISTORICO')">Histórico</ac-button>
    </div>
  </header>

  @if (error(); as e) { <p class="sol-eval__error" role="alert">{{ e }}</p> }

  @if (loading()) {
    <p role="status">Cargando…</p>
  } @else if (solicitudes().length === 0) {
    <p>No hay solicitudes.</p>
  } @else {
    <ul class="sol-eval__list">
      @for (s of solicitudes(); track s.id) {
        <li>
          <ac-card padding="md">
            <h2 class="sol-eval__h2">{{ s.trabajoTitulo }}</h2>
            @if (s.motivo) { <p>{{ s.motivo }}</p> }
            @if (s.estado === 'PENDIENTE') {
              <div class="sol-eval__actions">
                <ac-button size="sm" [loading]="actionId() === s.id" (click)="aceptar(s)">Aceptar</ac-button>
                <ac-button size="sm" variant="ghost" [loading]="actionId() === s.id" (click)="rechazar(s)">Rechazar</ac-button>
              </div>
            } @else {
              <p class="sol-eval__estado">{{ s.estado }}</p>
            }
          </ac-card>
        </li>
      }
    </ul>
    <div class="sol-eval__pager">
      <ac-button size="sm" variant="ghost" [disabled]="first()" (click)="paginaAnterior()">Anterior</ac-button>
      <ac-button size="sm" variant="ghost" [disabled]="last()" (click)="paginaSiguiente()">Siguiente</ac-button>
    </div>
  }
</section>
```

- [ ] **Step 3: SCSS**

```scss
.sol-eval__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
.sol-eval__tabs, .sol-eval__actions, .sol-eval__pager { display: flex; gap: 0.5rem; }
```

- [ ] **Step 4: Registrar la ruta**

Leé el archivo de rutas del feature evaluaciones (`src/app/features/evaluaciones/evaluaciones.routes.ts`) y mirá cómo se declaran las rutas existentes (cola, evaluar) y su guard de rol. Agregá una ruta nueva siguiendo EXACTAMENTE ese patrón:
```typescript
  {
    path: 'solicitudes-evaluacion',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['PROFESOR', 'EXTERNO'] },
    loadComponent: () =>
      import('./solicitudes-evaluacion-page/solicitudes-evaluacion-page')
        .then((m) => m.SolicitudesEvaluacionPage),
    title: 'Solicitudes de evaluación · AcademConnect',
  },
```
Usá los mismos imports/alias (`authGuard`, `roleGuard`) que el archivo ya use. Si las rutas de evaluaciones se registran vía un `EVALUACIONES_ROUTES` spreado en `app.routes.ts`, esta ruta queda incluida automáticamente; si no, registrala donde corresponda como las otras del feature.

- [ ] **Step 5: Link en el sidebar**

En `src/app/layout/sidebar/sidebar.ts`, en la sección del evaluador (`SECTIONS_EVALUADOR`, usada por PROFESOR/EXTERNO), agregá un item siguiendo el formato de los existentes, apuntando a `/solicitudes-evaluacion` con label "Solicitudes de evaluación".

- [ ] **Step 6: Verificar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit`
Expected: cero errores.

- [ ] **Step 7: Commit**

```bash
git -C /home/ignacio/Projects/academconnect-web add src/app/features/evaluaciones/solicitudes-evaluacion-page/ src/app/features/evaluaciones/evaluaciones.routes.ts src/app/layout/sidebar/sidebar.ts
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(evaluadores): página de solicitudes de evaluación recibidas"
```

---

## Verificación final

- [ ] Backend: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test` → PASS (incluye `@SpringBootTest` que bootean Flyway con V26/V27).
- [ ] Frontend: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit` → cero errores (correr los specs en entorno con browser runner).
- [ ] Manual: como estudiante con un trabajo con orientador, en `EN_DESARROLLO`, con ≥1 versión → bloque "Banca evaluadora" muestra "Necesitás N", recomendados + buscador (sin orientador/coorientador/ya invitados), permite invitar hasta completar N; como profesor/externo invitado → la solicitud aparece en "Solicitudes de evaluación" y al aceptar se crea la asignación (aparece en su cola de evaluación y el trabajo pasa a EN_EVALUACION).

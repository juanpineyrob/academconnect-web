# Pipeline multi-instancia de evaluación (4b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insertar la instancia de evaluación entre el trabajo y las asignaciones: banca y veredicto por instancia, reintentos con tope, gating secuencial configurable, derivando el estado del trabajo.

**Architecture:** Config extendida (4a) con `secuencial` (por tipo) y `maxIntentos` (por instancia). Nueva entidad `InstanciaEvaluacion` (materialización por trabajo, con `intento` y estado). Un motor `InstanciaEvaluacionService` concentra las transiciones (materializar/aprobar/reprobar). La banca de #2 y el veredicto de `EvaluacionService` se reworkean para operar por instancia, con fallback a ronda única cuando el tipo no tiene instancias configuradas.

**Tech Stack:** Backend Spring Boot/Java (JPA, Flyway, MapStruct, Mockito/JUnit5) en `/home/ignacio/Projects/academconnect`. Frontend Angular v20 en `/home/ignacio/Projects/academconnect-web`.

## Global Constraints

- Dos repos: backend = `/home/ignacio/Projects/academconnect`, frontend = `/home/ignacio/Projects/academconnect-web`. `git` con `git -C <repo>`.
- Commits directos a `main`. **NO** trailer `Co-Authored-By`. **NO** push.
- `git add` con rutas explícitas (hay archivos sin trackear/modificados no relacionados — no incluirlos).
- Backend: Flyway + `ddl-auto=validate` → toda tabla/columna de entidad nueva DEBE tener migración o el contexto no levanta. La última migración existente es **V28**; las nuevas son **V29** y **V30**. Verificar siempre con un `@SpringBootTest` que bootee Flyway.
- Compatibilidad: tipo **sin instancias configuradas** → comportamiento de ronda única actual (banca por trabajo con `evaluadoresDefault`, veredicto a nivel trabajo). La FK `Asignacion.instancia_evaluacion_id` es nullable; las asignaciones legacy (sin instancia) mantienen la rama actual.
- `TipoTrabajoConfig` conserva `evaluadoresDefault` (fallback ronda única). `InstanciaEvaluacionConfig` conserva `evaluadoresRequeridos` (dimensiona la banca por instancia).
- Frontend Angular v20: standalone (sin `standalone:true`), `ChangeDetectionStrategy.OnPush`, `inject()`, signals, control flow nativo, sin `ngClass`/`ngStyle`. AXE/WCAG AA.
- **Runner de tests frontend = Vitest browser mode, puede no estar disponible.** Escribir el `.spec`; intentar el runner una vez; gate real = `npx tsc -p tsconfig.app.json --noEmit` (cero errores).
- Defaults de config nuevos: `TipoTrabajoConfig.secuencial = true`; `InstanciaEvaluacionConfig.maxIntentos = 1` (≥1).

**Spec:** `docs/superpowers/specs/2026-06-25-pipeline-multi-instancia-design.md`

---

## Task 1: Extender la config (secuencial + maxIntentos) — entidades, migración V29, DTOs, servicio, UI admin

**Files:**
- Modify: `.../domain/TipoTrabajoConfig.java`, `.../domain/InstanciaEvaluacionConfig.java`
- Create: `.../db/migration/V29__config_secuencial_maxintentos.sql`
- Modify: `.../dto/TipoTrabajoConfigRequest.java`, `.../dto/TipoTrabajoConfigResponse.java`, `.../dto/InstanciaEvaluacionConfigDto.java`, `.../dto/InstanciaEvaluacionConfigInput.java`
- Modify: `.../service/TipoTrabajoConfigService.java`
- Test: `.../service/TipoTrabajoConfigServiceTests.java`
- Modify (frontend): `src/app/features/admin/tipos-trabajo-config.models.ts`, `.../tipos-trabajo-config-page/tipos-trabajo-config-page.ts`, `.../tipos-trabajo-config-page.html`

**Interfaces:**
- Produces: `TipoTrabajoConfig.secuencial` (col `secuencial`), `InstanciaEvaluacionConfig.maxIntentos` (col `max_intentos`); DTOs ganan `secuencial` (response/request) y `maxIntentos` (instancia dto/input); servicio persiste ambos.

- [ ] **Step 1: Agregar los campos a las entidades**

En `TipoTrabajoConfig.java`, tras `evaluadoresDefault`:
```java
    @Column(nullable = false)
    private boolean secuencial = true;
```
En `InstanciaEvaluacionConfig.java`, tras `evaluadoresRequeridos`:
```java
    @Column(name = "max_intentos", nullable = false)
    private int maxIntentos = 1;
```

- [ ] **Step 2: Migración V29**

Crear `src/main/resources/db/migration/V29__config_secuencial_maxintentos.sql`:
```sql
-- V29__config_secuencial_maxintentos.sql
ALTER TABLE tipo_trabajo_config
    ADD COLUMN secuencial BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE instancia_evaluacion_config
    ADD COLUMN max_intentos INTEGER NOT NULL DEFAULT 1;

ALTER TABLE instancia_evaluacion_config
    ADD CONSTRAINT chk_instancia_max_intentos CHECK (max_intentos >= 1);
```

- [ ] **Step 3: Extender DTOs**

`InstanciaEvaluacionConfigDto` (output) → agregar `int maxIntentos` al final del record.
`InstanciaEvaluacionConfigInput` (input) → agregar `@NotNull @Min(1) Integer maxIntentos`.
`TipoTrabajoConfigResponse` → agregar `boolean secuencial`.
`TipoTrabajoConfigRequest` → agregar `boolean secuencial` (sin anotación; primitivo, default false en JSON ausente — pero el front siempre lo manda).

Reemplazá cada record para incluir el campo nuevo manteniendo el orden de los existentes (el `secuencial` al final del response/request; `maxIntentos` al final del dto/input).

- [ ] **Step 4: Escribir el test que falla (extiende `TipoTrabajoConfigServiceTests`)**

Agregar:
```java
    @Test
    void actualizar_persisteSecuencialYMaxIntentos() {
        var req = new TipoTrabajoConfigRequest(ModoEvaluacion.SINCRONO, 3, false,
                List.of(new InstanciaEvaluacionConfigInput("TCC1", 2, 3)));
        var resp = service.actualizar(TipoTrabajo.TCC, req);
        Assertions.assertFalse(resp.secuencial());
        ArgumentCaptor<List<InstanciaEvaluacionConfig>> cap = ArgumentCaptor.forClass(List.class);
        Mockito.verify(instanciaRepository).saveAll(cap.capture());
        Assertions.assertEquals(3, cap.getValue().get(0).getMaxIntentos());
    }
```
> Ajustá las llamadas a `new TipoTrabajoConfigRequest(...)`/`new InstanciaEvaluacionConfigInput(...)` en LOS TESTS EXISTENTES de esta clase al nuevo número de args (agregando `secuencial`/`maxIntentos`), o compilará en rojo. Documentá el ajuste.

- [ ] **Step 5: Correr el test para verlo fallar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=TipoTrabajoConfigServiceTests`
Expected: FALLA de compilación / test.

- [ ] **Step 6: Implementar en el servicio**

En `TipoTrabajoConfigService.actualizar`, tras `config.setEvaluadoresDefault(...)` agregar `config.setSecuencial(request.secuencial());`. En el loop que crea cada `InstanciaEvaluacionConfig`, agregar `inst.setMaxIntentos(in.maxIntentos());`. En `toResponse`, pasar `c.isSecuencial()` al `TipoTrabajoConfigResponse` y `i.getMaxIntentos()` a cada `InstanciaEvaluacionConfigDto`.

- [ ] **Step 7: Correr tests (verde)**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=TipoTrabajoConfigServiceTests`
Expected: PASS.

- [ ] **Step 8: Frontend — modelos + editor**

En `tipos-trabajo-config.models.ts`: `InstanciaConfig` y el `{nombre,evaluadoresRequeridos}` del payload ganan `maxIntentos: number`; `TipoTrabajoConfig` y `TipoTrabajoConfigPayload` ganan `secuencial: boolean`.

En `tipos-trabajo-config-page.ts`: el form group gana `secuencial: [true]`; `nuevaInstancia(nombre, evaluadores, maxIntentos = 1)` agrega control `maxIntentos: [maxIntentos, [Validators.required, Validators.min(1)]]`; `seleccionar` setea `secuencial` desde la config y pasa `i.maxIntentos`; `guardar` incluye `secuencial: this.form.controls.secuencial.value` y `maxIntentos` por instancia.

En `tipos-trabajo-config-page.html`: un checkbox etiquetado para `secuencial` (`<input type="checkbox" formControlName="secuencial" />` con su `<span>` label), y por fila de instancia un `<input type="number" min="1" formControlName="maxIntentos" [attr.aria-label]="'Máx. intentos de la instancia ' + ($index+1)" />`.

- [ ] **Step 9: Typecheck frontend**

Run: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit`
Expected: cero errores.

- [ ] **Step 10: Commit (backend + frontend juntos — el contrato cambió en ambos)**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/domain/TipoTrabajoConfig.java src/main/java/com/academconnect/domain/InstanciaEvaluacionConfig.java src/main/resources/db/migration/V29__config_secuencial_maxintentos.sql src/main/java/com/academconnect/dto/TipoTrabajoConfigRequest.java src/main/java/com/academconnect/dto/TipoTrabajoConfigResponse.java src/main/java/com/academconnect/dto/InstanciaEvaluacionConfigDto.java src/main/java/com/academconnect/dto/InstanciaEvaluacionConfigInput.java src/main/java/com/academconnect/service/TipoTrabajoConfigService.java src/test/java/com/academconnect/service/TipoTrabajoConfigServiceTests.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(4b): config secuencial por tipo y maxIntentos por instancia"
git -C /home/ignacio/Projects/academconnect-web add src/app/features/admin/tipos-trabajo-config.models.ts src/app/features/admin/tipos-trabajo-config-page/
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(4b): editar secuencial y maxIntentos en el panel de tipos de trabajo"
```

---

## Task 2: Entidad `InstanciaEvaluacion` + enum + repo + migración V30

**Files:**
- Create: `.../domain/EstadoInstanciaEvaluacion.java`, `.../domain/InstanciaEvaluacion.java`, `.../repository/InstanciaEvaluacionRepository.java`
- Modify: `.../domain/Asignacion.java`
- Create: `.../db/migration/V30__instancia_evaluacion.sql`

**Interfaces:**
- Produces: enum `EstadoInstanciaEvaluacion {PENDIENTE, EN_CURSO, APROBADA, REPROBADA}`; entidad `InstanciaEvaluacion` (`trabajo`, `instanciaConfig`, `orden`, `intento`, `estado`, `puntajeAgregado`, `cerradaEn`); `Asignacion.instanciaEvaluacion` (FK nullable); repo con `findByTrabajoIdOrderByOrdenAscIntentoAsc`, `findFirstByTrabajoIdAndEstadoNotInOrderByOrdenAsc(Long, Collection<EstadoInstanciaEvaluacion>)`, `countByTrabajoIdAndInstanciaConfigIdAndEstado`.

- [ ] **Step 1: Enum**

```java
package com.academconnect.domain;

public enum EstadoInstanciaEvaluacion {
    PENDIENTE, EN_CURSO, APROBADA, REPROBADA
}
```

- [ ] **Step 2: Entidad**

```java
package com.academconnect.domain;

import java.math.BigDecimal;
import java.time.Instant;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "instancia_evaluacion")
@Getter
@Setter
@NoArgsConstructor
public class InstanciaEvaluacion extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trabajo_id", nullable = false)
    private Trabajo trabajo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "instancia_config_id", nullable = false)
    private InstanciaEvaluacionConfig instanciaConfig;

    @Column(nullable = false)
    private int orden;

    @Column(nullable = false)
    private int intento;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EstadoInstanciaEvaluacion estado = EstadoInstanciaEvaluacion.PENDIENTE;

    @Column(name = "puntaje_agregado", precision = 6, scale = 2)
    private BigDecimal puntajeAgregado;

    @Column(name = "cerrada_en")
    private Instant cerradaEn;
}
```

- [ ] **Step 3: FK en `Asignacion`**

En `Asignacion.java`, agregar (junto a las otras relaciones):
```java
    /** Instancia de evaluación a la que pertenece esta asignación. Null para asignaciones legacy (ronda única). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "instancia_evaluacion_id")
    private InstanciaEvaluacion instanciaEvaluacion;
```

- [ ] **Step 4: Repositorio**

```java
package com.academconnect.repository;

import com.academconnect.domain.EstadoInstanciaEvaluacion;
import com.academconnect.domain.InstanciaEvaluacion;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InstanciaEvaluacionRepository extends JpaRepository<InstanciaEvaluacion, Long> {

    List<InstanciaEvaluacion> findByTrabajoIdOrderByOrdenAscIntentoAsc(Long trabajoId);

    /** Instancia activa: la no cerrada de menor orden. */
    Optional<InstanciaEvaluacion> findFirstByTrabajoIdAndEstadoNotInOrderByOrdenAsc(
            Long trabajoId, Collection<EstadoInstanciaEvaluacion> estados);

    long countByTrabajoIdAndInstanciaConfigIdAndEstado(
            Long trabajoId, Long instanciaConfigId, EstadoInstanciaEvaluacion estado);
}
```

- [ ] **Step 5: Migración V30**

Crear `src/main/resources/db/migration/V30__instancia_evaluacion.sql`:
```sql
-- V30__instancia_evaluacion.sql
CREATE TABLE instancia_evaluacion (
    id BIGSERIAL PRIMARY KEY,
    trabajo_id BIGINT NOT NULL REFERENCES trabajo(id) ON DELETE CASCADE,
    instancia_config_id BIGINT NOT NULL REFERENCES instancia_evaluacion_config(id) ON DELETE RESTRICT,
    orden INTEGER NOT NULL,
    intento INTEGER NOT NULL,
    estado VARCHAR(20) NOT NULL,
    puntaje_agregado NUMERIC(6,2),
    cerrada_en TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    updated_by VARCHAR(100) NOT NULL,
    CONSTRAINT chk_instancia_eval_estado CHECK (
        estado IN ('PENDIENTE','EN_CURSO','APROBADA','REPROBADA')
    ),
    CONSTRAINT chk_instancia_eval_intento CHECK (intento >= 1)
);

CREATE INDEX ix_instancia_eval_trabajo ON instancia_evaluacion (trabajo_id);

-- A lo sumo una instancia ABIERTA (PENDIENTE/EN_CURSO) por trabajo+config (evita doble materialización).
CREATE UNIQUE INDEX uq_instancia_eval_abierta
    ON instancia_evaluacion (trabajo_id, instancia_config_id)
    WHERE estado IN ('PENDIENTE','EN_CURSO');

ALTER TABLE asignacion
    ADD COLUMN instancia_evaluacion_id BIGINT REFERENCES instancia_evaluacion(id) ON DELETE SET NULL;
```

- [ ] **Step 6: Compilar + bootear contexto**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: BUILD SUCCESS (Flyway aplica V30, `validate` pasa). Si falla por schema, ajustá la DDL a las columnas exactas de la entidad / `BaseEntity`.

- [ ] **Step 7: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/domain/EstadoInstanciaEvaluacion.java src/main/java/com/academconnect/domain/InstanciaEvaluacion.java src/main/java/com/academconnect/domain/Asignacion.java src/main/java/com/academconnect/repository/InstanciaEvaluacionRepository.java src/main/resources/db/migration/V30__instancia_evaluacion.sql
git -C /home/ignacio/Projects/academconnect commit -m "feat(4b): entidad InstanciaEvaluacion, FK en Asignacion y migración V30"
```

---

## Task 3: Motor `InstanciaEvaluacionService` (materializar / aprobar / reprobar) — TDD

**Files:**
- Create: `.../service/InstanciaEvaluacionService.java`
- Test: `.../service/InstanciaEvaluacionServiceTests.java`

**Interfaces:**
- Consumes: Task 1 (`secuencial`, `maxIntentos`), Task 2 (entity/enum/repo), `InstanciaEvaluacionConfigRepository.findByTipoOrderByOrden`, `TipoTrabajoConfigRepository`, `TrabajoRepository`, `EstadoTrabajo`.
- Produces: `Optional<InstanciaEvaluacion> materializarInicial(Trabajo)`, `Optional<InstanciaEvaluacion> instanciaActiva(Long trabajoId)`, `void alAprobar(InstanciaEvaluacion, BigDecimal puntaje)`, `void alReprobar(InstanciaEvaluacion, BigDecimal puntaje)`.

- [ ] **Step 1: Escribir los tests que fallan**

```java
package com.academconnect.service;

import com.academconnect.domain.*;
import com.academconnect.repository.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class InstanciaEvaluacionServiceTests {

    @InjectMocks private InstanciaEvaluacionService service;
    @Mock private InstanciaEvaluacionRepository repository;
    @Mock private InstanciaEvaluacionConfigRepository configRepository;
    @Mock private TrabajoRepository trabajoRepository;

    private Trabajo trabajo;
    private InstanciaEvaluacionConfig c0, c1;

    @BeforeEach
    void setup() {
        trabajo = new Trabajo();
        trabajo.setId(100L);
        trabajo.setTipo(TipoTrabajo.TCC);
        trabajo.setEstado(EstadoTrabajo.EN_DESARROLLO);

        c0 = new InstanciaEvaluacionConfig();
        c0.setId(1L); c0.setTipo(TipoTrabajo.TCC); c0.setOrden(0); c0.setNombre("TCC1");
        c0.setEvaluadoresRequeridos(2); c0.setMaxIntentos(2);
        c1 = new InstanciaEvaluacionConfig();
        c1.setId(2L); c1.setTipo(TipoTrabajo.TCC); c1.setOrden(1); c1.setNombre("TCC2");
        c1.setEvaluadoresRequeridos(2); c1.setMaxIntentos(1);

        Mockito.when(configRepository.findByTipoOrderByOrden(TipoTrabajo.TCC)).thenReturn(List.of(c0, c1));
        Mockito.when(repository.save(Mockito.any())).thenAnswer(i -> i.getArgument(0));
        Mockito.when(trabajoRepository.save(Mockito.any())).thenAnswer(i -> i.getArgument(0));
    }

    private TipoTrabajoConfig tipoCfg(boolean secuencial) {
        var t = new TipoTrabajoConfig();
        t.setTipo(TipoTrabajo.TCC); t.setModoEvaluacion(ModoEvaluacion.SINCRONO);
        t.setEvaluadoresDefault(2); t.setSecuencial(secuencial);
        return t;
    }

    private InstanciaEvaluacion inst(InstanciaEvaluacionConfig c, int intento, EstadoInstanciaEvaluacion estado) {
        var ie = new InstanciaEvaluacion();
        ie.setTrabajo(trabajo); ie.setInstanciaConfig(c); ie.setOrden(c.getOrden());
        ie.setIntento(intento); ie.setEstado(estado);
        return ie;
    }

    @Test
    void materializarInicial_creaPrimeraInstancia() {
        Mockito.when(repository.findFirstByTrabajoIdAndEstadoNotInOrderByOrdenAsc(
                Mockito.eq(100L), Mockito.anyCollection())).thenReturn(Optional.empty());

        var res = service.materializarInicial(trabajo);

        Assertions.assertTrue(res.isPresent());
        ArgumentCaptor<InstanciaEvaluacion> cap = ArgumentCaptor.forClass(InstanciaEvaluacion.class);
        Mockito.verify(repository).save(cap.capture());
        Assertions.assertEquals(0, cap.getValue().getOrden());
        Assertions.assertEquals(1, cap.getValue().getIntento());
        Assertions.assertEquals(EstadoInstanciaEvaluacion.PENDIENTE, cap.getValue().getEstado());
    }

    @Test
    void materializarInicial_sinConfigNoHaceNada() {
        Mockito.when(configRepository.findByTipoOrderByOrden(TipoTrabajo.TCC)).thenReturn(List.of());
        Assertions.assertTrue(service.materializarInicial(trabajo).isEmpty());
        Mockito.verify(repository, Mockito.never()).save(Mockito.any());
    }

    @Test
    void materializarInicial_idempotenteSiYaExisteActiva() {
        Mockito.when(repository.findFirstByTrabajoIdAndEstadoNotInOrderByOrdenAsc(
                Mockito.eq(100L), Mockito.anyCollection()))
                .thenReturn(Optional.of(inst(c0, 1, EstadoInstanciaEvaluacion.PENDIENTE)));
        service.materializarInicial(trabajo);
        Mockito.verify(repository, Mockito.never()).save(Mockito.any());
    }

    @Test
    void alAprobar_materializaSiguienteSiSecuencial() {
        Mockito.when(trabajoRepository.findById(100L)).thenReturn(Optional.of(trabajo));
        Mockito.when(tipoTrabajoConfigRepository.findById(TipoTrabajo.TCC)).thenReturn(Optional.of(tipoCfg(true)));
        var ie0 = inst(c0, 1, EstadoInstanciaEvaluacion.EN_CURSO);

        service.alAprobar(ie0, new BigDecimal("8.00"));

        Assertions.assertEquals(EstadoInstanciaEvaluacion.APROBADA, ie0.getEstado());
        // materializa c1 (orden 1)
        ArgumentCaptor<InstanciaEvaluacion> cap = ArgumentCaptor.forClass(InstanciaEvaluacion.class);
        Mockito.verify(repository, Mockito.atLeast(1)).save(cap.capture());
        Assertions.assertTrue(cap.getAllValues().stream().anyMatch(x -> x.getOrden() == 1 && x.getIntento() == 1));
        Assertions.assertNotEquals(EstadoTrabajo.APROBADO, trabajo.getEstado()); // aún no
    }

    @Test
    void alAprobar_ultimaInstancia_apruebaTrabajo() {
        Mockito.when(trabajoRepository.findById(100L)).thenReturn(Optional.of(trabajo));
        Mockito.when(tipoTrabajoConfigRepository.findById(TipoTrabajo.TCC)).thenReturn(Optional.of(tipoCfg(true)));
        var ie1 = inst(c1, 1, EstadoInstanciaEvaluacion.EN_CURSO); // orden 1 = última

        service.alAprobar(ie1, new BigDecimal("9.00"));

        Assertions.assertEquals(EstadoTrabajo.APROBADO, trabajo.getEstado());
    }

    @Test
    void alReprobar_reintentaSiHayCupo() {
        Mockito.when(trabajoRepository.findById(100L)).thenReturn(Optional.of(trabajo));
        var ie0 = inst(c0, 1, EstadoInstanciaEvaluacion.EN_CURSO); // c0 maxIntentos=2

        service.alReprobar(ie0, new BigDecimal("3.00"));

        Assertions.assertEquals(EstadoInstanciaEvaluacion.REPROBADA, ie0.getEstado());
        ArgumentCaptor<InstanciaEvaluacion> cap = ArgumentCaptor.forClass(InstanciaEvaluacion.class);
        Mockito.verify(repository, Mockito.atLeast(1)).save(cap.capture());
        Assertions.assertTrue(cap.getAllValues().stream()
                .anyMatch(x -> x.getInstanciaConfig() == c0 && x.getIntento() == 2));
        Assertions.assertNotEquals(EstadoTrabajo.RECHAZADO, trabajo.getEstado());
    }

    @Test
    void alReprobar_sinCupoRechazaTrabajo() {
        Mockito.when(trabajoRepository.findById(100L)).thenReturn(Optional.of(trabajo));
        var ie1 = inst(c1, 1, EstadoInstanciaEvaluacion.EN_CURSO); // c1 maxIntentos=1

        service.alReprobar(ie1, new BigDecimal("2.00"));

        Assertions.assertEquals(EstadoTrabajo.RECHAZADO, trabajo.getEstado());
    }
```

Agregar el `@Mock private TipoTrabajoConfigRepository tipoTrabajoConfigRepository;` a los mocks de la clase.

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=InstanciaEvaluacionServiceTests`
Expected: FALLA — el servicio no existe.

- [ ] **Step 3: Implementar el motor**

```java
package com.academconnect.service;

import com.academconnect.domain.EstadoInstanciaEvaluacion;
import com.academconnect.domain.EstadoTrabajo;
import com.academconnect.domain.InstanciaEvaluacion;
import com.academconnect.domain.InstanciaEvaluacionConfig;
import com.academconnect.domain.Trabajo;
import com.academconnect.repository.InstanciaEvaluacionConfigRepository;
import com.academconnect.repository.InstanciaEvaluacionRepository;
import com.academconnect.repository.TipoTrabajoConfigRepository;
import com.academconnect.repository.TrabajoRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
@RequiredArgsConstructor
public class InstanciaEvaluacionService {

    private static final Set<EstadoInstanciaEvaluacion> ABIERTAS =
            Set.of(EstadoInstanciaEvaluacion.PENDIENTE, EstadoInstanciaEvaluacion.EN_CURSO);

    private final InstanciaEvaluacionRepository repository;
    private final InstanciaEvaluacionConfigRepository configRepository;
    private final TipoTrabajoConfigRepository tipoTrabajoConfigRepository;
    private final TrabajoRepository trabajoRepository;

    /** Materializa la primera instancia (orden 0) si el tipo tiene config y no hay activa. */
    public Optional<InstanciaEvaluacion> materializarInicial(Trabajo trabajo) {
        List<InstanciaEvaluacionConfig> configs = configRepository.findByTipoOrderByOrden(trabajo.getTipo());
        if (configs.isEmpty()) return Optional.empty();
        if (instanciaActiva(trabajo.getId()).isPresent()) return Optional.empty();
        return Optional.of(materializar(trabajo, configs.get(0), 1));
    }

    @Transactional(readOnly = true)
    public Optional<InstanciaEvaluacion> instanciaActiva(Long trabajoId) {
        return repository.findFirstByTrabajoIdAndEstadoNotInOrderByOrdenAsc(
                trabajoId, List.of(EstadoInstanciaEvaluacion.APROBADA, EstadoInstanciaEvaluacion.REPROBADA));
    }

    public void alAprobar(InstanciaEvaluacion instancia, BigDecimal puntaje) {
        cerrar(instancia, EstadoInstanciaEvaluacion.APROBADA, puntaje);
        var trabajo = instancia.getTrabajo();
        boolean secuencial = tipoTrabajoConfigRepository.findById(trabajo.getTipo())
                .map(c -> c.isSecuencial()).orElse(true);

        List<InstanciaEvaluacionConfig> configs = configRepository.findByTipoOrderByOrden(trabajo.getTipo());
        Optional<InstanciaEvaluacionConfig> siguiente = configs.stream()
                .filter(c -> c.getOrden() > instancia.getOrden())
                .findFirst();

        if (secuencial) {
            if (siguiente.isPresent()) {
                materializar(trabajo, siguiente.get(), 1);
            } else {
                aprobarTrabajo(trabajo);
            }
        } else {
            // independiente: aprobar el trabajo cuando todas las config tengan una instancia APROBADA
            boolean todasAprobadas = configs.stream().allMatch(c ->
                    repository.countByTrabajoIdAndInstanciaConfigIdAndEstado(
                            trabajo.getId(), c.getId(), EstadoInstanciaEvaluacion.APROBADA) > 0);
            if (todasAprobadas) {
                aprobarTrabajo(trabajo);
            } else if (siguiente.isPresent()) {
                materializar(trabajo, siguiente.get(), 1);
            }
        }
    }

    public void alReprobar(InstanciaEvaluacion instancia, BigDecimal puntaje) {
        cerrar(instancia, EstadoInstanciaEvaluacion.REPROBADA, puntaje);
        var trabajo = instancia.getTrabajo();
        if (instancia.getIntento() < instancia.getInstanciaConfig().getMaxIntentos()) {
            materializar(trabajo, instancia.getInstanciaConfig(), instancia.getIntento() + 1);
        } else {
            rechazarTrabajo(trabajo);
        }
    }

    private InstanciaEvaluacion materializar(Trabajo trabajo, InstanciaEvaluacionConfig config, int intento) {
        var ie = new InstanciaEvaluacion();
        ie.setTrabajo(trabajo);
        ie.setInstanciaConfig(config);
        ie.setOrden(config.getOrden());
        ie.setIntento(intento);
        ie.setEstado(EstadoInstanciaEvaluacion.PENDIENTE);
        return repository.save(ie);
    }

    private void cerrar(InstanciaEvaluacion instancia, EstadoInstanciaEvaluacion estado, BigDecimal puntaje) {
        instancia.setEstado(estado);
        instancia.setPuntajeAgregado(puntaje);
        instancia.setCerradaEn(Instant.now());
        repository.save(instancia);
    }

    private void aprobarTrabajo(Trabajo trabajo) {
        trabajo.setEstado(EstadoTrabajo.APROBADO);
        trabajo.setEvaluadoEn(Instant.now());
        trabajoRepository.save(trabajo);
    }

    private void rechazarTrabajo(Trabajo trabajo) {
        trabajo.setEstado(EstadoTrabajo.RECHAZADO);
        trabajo.setEvaluadoEn(Instant.now());
        trabajoRepository.save(trabajo);
    }
}
```

> Verificá que `Trabajo` tenga `setEvaluadoEn(Instant)` (lo usa `EvaluacionService` hoy). Si el setter difiere, ajustá.

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=InstanciaEvaluacionServiceTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/service/InstanciaEvaluacionService.java src/test/java/com/academconnect/service/InstanciaEvaluacionServiceTests.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(4b): motor de transiciones de instancias de evaluación"
```

---

## Task 4: Materializar al asignar orientador + banca por instancia (rework #2) — TDD

**Files:**
- Modify: `.../service/InvitacionOrientacionService.java` (hook materializar)
- Modify: `.../service/SolicitudEvaluacionService.java` (banca por instancia + ligar asignación)
- Test: `.../service/SolicitudEvaluacionServiceTests.java`

**Interfaces:**
- Consumes: Task 3 (`InstanciaEvaluacionService`: `materializarInicial`, `instanciaActiva`), Task 2 (`InstanciaEvaluacion`).

- [ ] **Step 1: Hook de materialización al aceptar orientador**

En `InvitacionOrientacionService`, inyectar `InstanciaEvaluacionService instanciaEvaluacionService` (campo `final`) y, en `aceptar`, después de `trabajo.setEstado(EstadoTrabajo.EN_DESARROLLO);` y `trabajoRepository.save(trabajo);`, agregar:
```java
        instanciaEvaluacionService.materializarInicial(trabajo);
```
(materializarInicial es no-op si el tipo no tiene config → ronda única.)

- [ ] **Step 2: Escribir el test que falla (banca por instancia)**

En `SolicitudEvaluacionServiceTests`, agregar el mock `@Mock private InstanciaEvaluacionService instanciaEvaluacionService;` y un test:
```java
    @Test
    void crear_dimensionaBancaPorInstanciaActiva() {
        // instancia activa con config de 2 evaluadores; ya hay 1 asignación activa → cabe 1 más
        var cfg = new com.academconnect.domain.InstanciaEvaluacionConfig();
        cfg.setEvaluadoresRequeridos(2);
        var ie = new com.academconnect.domain.InstanciaEvaluacion();
        ie.setInstanciaConfig(cfg);
        Mockito.when(instanciaEvaluacionService.instanciaActiva(100L)).thenReturn(java.util.Optional.of(ie));
        Mockito.when(asignacionRepository.countByTrabajoIdAndEstado(100L, EstadoAsignacion.ACTIVA)).thenReturn(2L);
        Mockito.when(repository.countByTrabajoIdAndEstado(100L, EstadoInvitacion.PENDIENTE)).thenReturn(0L);
        // banca llena (2 activas para N=2 de la instancia) → error
        Assertions.assertThrows(BusinessException.class, () -> service.crear(req(30L), estudiante.getId()));
    }
```
> Reutilizá los fixtures existentes de la clase (`trabajo` id 100, `estudiante`, `req(...)`, mocks de versión/template/coorientador/conflicto). Ajustá si la instancia activa debe estar stubeada en el `@BeforeEach` para los demás tests (devolvé `Optional.empty()` por defecto en setup para no romperlos → fallback ronda única con `evaluadoresDefault`).

- [ ] **Step 3: Correr para ver fallar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=SolicitudEvaluacionServiceTests`
Expected: FALLA (el servicio aún no consulta la instancia activa).

- [ ] **Step 4: Rework de `SolicitudEvaluacionService`**

Inyectar `InstanciaEvaluacionService instanciaEvaluacionService` (campo `final`).

Reemplazar el helper `evaluadoresRequeridos(trabajo)` por una versión que prioriza la instancia activa:
```java
    private int evaluadoresRequeridos(com.academconnect.domain.Trabajo trabajo) {
        var activa = instanciaEvaluacionService.instanciaActiva(trabajo.getId());
        if (activa.isPresent()) {
            return activa.get().getInstanciaConfig().getEvaluadoresRequeridos();
        }
        return tipoTrabajoConfigRepository.findById(trabajo.getTipo())
                .orElseThrow(() -> new BusinessException(
                        "No hay configuración de evaluadores para el tipo " + trabajo.getTipo()))
                .getEvaluadoresDefault();
    }
```

En `aceptar`, después de crear la `Asignacion` con `asignacionService.crear(...)`, ligar la asignación a la instancia activa y marcarla EN_CURSO. `asignacionService.crear` devuelve un `AsignacionResponse` (con id); recuperá la entidad y seteá la instancia:
```java
        var resp = asignacionService.crear(new AsignacionRequest(
                trabajo.getId(), version.getId(), s.getInvitado().getId(), template.getId(), null));
        instanciaEvaluacionService.instanciaActiva(trabajo.getId()).ifPresent(ie -> {
            asignacionRepository.findById(resp.id()).ifPresent(a -> {
                a.setInstanciaEvaluacion(ie);
                asignacionRepository.save(a);
            });
            if (ie.getEstado() == com.academconnect.domain.EstadoInstanciaEvaluacion.PENDIENTE) {
                ie.setEstado(com.academconnect.domain.EstadoInstanciaEvaluacion.EN_CURSO);
                instanciaEvaluacionRepository.save(ie);
            }
        });
```
> Verificá el getter del id en `AsignacionResponse` (probablemente `id()`). Inyectá `InstanciaEvaluacionRepository instanciaEvaluacionRepository` para el `save` de la instancia (o exponé un método en el motor `marcarEnCurso(ie)` y usalo — preferible para no inyectar el repo acá; si lo hacés, agregá `void marcarEnCurso(InstanciaEvaluacion)` al motor en Task 3 y usalo). Elegí UNA vía y mantené la coherencia.

- [ ] **Step 5: Correr tests (verde)**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest='SolicitudEvaluacionServiceTests,InvitacionOrientacionServiceTests'`
Expected: PASS (ajustá expectativas de tests existentes que asumían banca por `evaluadoresDefault` si ahora hay instancia activa stubeada).

- [ ] **Step 6: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/service/InvitacionOrientacionService.java src/main/java/com/academconnect/service/SolicitudEvaluacionService.java src/test/java/com/academconnect/service/SolicitudEvaluacionServiceTests.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(4b): materializa instancia al asignar orientador y dimensiona banca por instancia"
```

---

## Task 5: Veredicto por instancia (rework `EvaluacionService.agregarVeredicto`) — TDD

**Files:**
- Modify: `.../service/EvaluacionService.java`
- Test: `.../service/EvaluacionServiceTests.java` (o el test existente del servicio)

**Interfaces:**
- Consumes: Task 3 (`InstanciaEvaluacionService.alAprobar/alReprobar`), Task 2 (`Asignacion.getInstanciaEvaluacion`). `EvaluacionRepository` (promedio por instancia — método nuevo), `AsignacionRepository` (count activas por instancia — método nuevo).

- [ ] **Step 1: Repos — promedio y count por instancia**

En `AsignacionRepository`:
```java
    long countByInstanciaEvaluacionIdAndEstado(Long instanciaEvaluacionId, EstadoAsignacion estado);
```
En `EvaluacionRepository` (mirá la query existente `promedioPorTrabajoYVersion` y replicá por instancia):
```java
    @org.springframework.data.jpa.repository.Query(
        "SELECT AVG(e.calificacionFinal) FROM Evaluacion e " +
        "WHERE e.asignacion.instanciaEvaluacion.id = :instanciaId " +
        "AND e.estado = com.academconnect.domain.EstadoEvaluacion.COMPLETADA")
    java.math.BigDecimal promedioPorInstancia(@org.springframework.data.repository.query.Param("instanciaId") Long instanciaId);
```
> Verificá el nombre real del campo de calificación en `Evaluacion` (la query existente `promedioPorTrabajoYVersion` lo usa — copiá esa expresión exacta, p. ej. `e.calificacionFinal` o el que sea).

- [ ] **Step 2: Escribir el test que falla**

Agregar un test que, dada una asignación CON `instanciaEvaluacion` y sin más asignaciones activas en esa instancia, invoque `alAprobar`/`alReprobar` según el promedio vs umbral; y un test legacy (asignación SIN instancia) que conserve el comportamiento actual (fija `Trabajo.estado`). Usá el patrón del test existente de `EvaluacionService` (mockeá `instanciaEvaluacionService`, `asignacionRepository.countByInstanciaEvaluacionIdAndEstado`, `evaluacionRepository.promedioPorInstancia`). Estructura:
```java
    @Test
    void agregarVeredicto_porInstancia_apruebaCuandoSuperaUmbral() {
        // asignacion.instanciaEvaluacion != null; 0 activas restantes; promedio >= umbral
        // → verify(instanciaEvaluacionService).alAprobar(eq(instancia), any())
    }
    @Test
    void agregarVeredicto_porInstancia_repruebaBajoUmbral() {
        // promedio < umbral → verify(instanciaEvaluacionService).alReprobar(...)
    }
    @Test
    void agregarVeredicto_legacy_sinInstancia_fijaEstadoTrabajo() {
        // asignacion.instanciaEvaluacion == null → comportamiento actual intacto
    }
```
> Escribí los tres con los mocks y asserts concretos según los fixtures reales del test del servicio (no dejes el cuerpo como comentario).

- [ ] **Step 3: Correr para ver fallar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=EvaluacionServiceTests`
Expected: FALLA.

- [ ] **Step 4: Rework de `agregarVeredicto`**

Inyectar `InstanciaEvaluacionService instanciaEvaluacionService`. Al inicio de `agregarVeredicto`, ramificar:
```java
        var instancia = asignacion.getInstanciaEvaluacion();
        if (instancia != null) {
            long activas = asignacionRepository.countByInstanciaEvaluacionIdAndEstado(
                    instancia.getId(), EstadoAsignacion.ACTIVA);
            if (activas > 0) return;
            BigDecimal promedio = evaluacionRepository.promedioPorInstancia(instancia.getId());
            if (promedio == null) return;
            BigDecimal puntaje = promedio.setScale(2, RoundingMode.HALF_UP);
            if (puntaje.compareTo(umbral) >= 0) {
                instanciaEvaluacionService.alAprobar(instancia, puntaje);
            } else {
                instanciaEvaluacionService.alReprobar(instancia, puntaje);
            }
            return;
        }
        // ---- rama legacy (ronda única) sin cambios ----
```
Dejá el cuerpo actual (promedio por trabajo+versión y `trabajo.setEstado`) intacto debajo, como rama legacy.

- [ ] **Step 5: Correr tests (verde)**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=EvaluacionServiceTests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/repository/AsignacionRepository.java src/main/java/com/academconnect/repository/EvaluacionRepository.java src/main/java/com/academconnect/service/EvaluacionService.java src/test/java/com/academconnect/service/EvaluacionServiceTests.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(4b): veredicto por instancia con fallback a ronda única"
```

---

## Task 6: Regresión backend completa

- [ ] **Step 1: Suite completa**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test`
Expected: BUILD SUCCESS (todas las migraciones V29/V30 aplican; los `@SpringBootTest` validan el schema). Si algún test existente rompió por los cambios de DTO/banca/veredicto, ajustalo al nuevo comportamiento documentando el motivo.

- [ ] **Step 2: Commit (solo si hubo ajustes)**

```bash
git -C /home/ignacio/Projects/academconnect add <archivos ajustados>
git -C /home/ignacio/Projects/academconnect commit -m "test(4b): ajusta expectativas al pipeline multi-instancia"
```
Si no hubo cambios, la suite verde es el entregable (sin commit).

---

## Task 7: Frontend — modelos + servicio de instancias del trabajo

**Files:**
- Create: `src/app/features/mis-trabajos/instancia-evaluacion.models.ts`
- Modify: `src/app/features/mis-trabajos/solicitud-evaluacion.service.ts` (método para listar instancias del trabajo)
- Test: `src/app/features/mis-trabajos/solicitud-evaluacion.service.spec.ts`

**Interfaces:**
- Produces: modelo `InstanciaEvaluacion` (`id, nombre, orden, intento, estado, puntajeAgregado`); `SolicitudEvaluacionService.listarInstancias(trabajoId)`.

> Requiere un endpoint backend que liste las instancias de un trabajo. Si NO existe, agregalo en este task: en `MeTrabajoController` (o el controller de evaluación) un `GET /api/me/trabajos/{id}/instancias-evaluacion` dueño-only que devuelva `List<InstanciaEvaluacionDto>` (id, nombre del config, orden, intento, estado, puntajeAgregado) vía un método de servicio que use `InstanciaEvaluacionRepository.findByTrabajoIdOrderByOrdenAscIntentoAsc`. Incluí su DTO y un test de servicio backend. (Este sub-paso es backend; commitéalo junto, y el front lo consume.)

- [ ] **Step 1: Backend — endpoint de instancias del trabajo**

Crear `InstanciaEvaluacionDto(Long id, String nombre, int orden, int intento, String estado, java.math.BigDecimal puntajeAgregado)`. En `MeTrabajoController`, endpoint dueño-only `GET /{id}/instancias-evaluacion` (`hasRole('ESTUDIANTE')` + validación de dueño como en `sugerirEvaluadores`) que llame a un método `listarInstancias(trabajoId)` (en `InstanciaEvaluacionService`, readOnly) que mapee `findByTrabajoIdOrderByOrdenAscIntentoAsc` → DTO (nombre = `ie.getInstanciaConfig().getNombre()`, `estado = ie.getEstado().name()`). Compilar + bootear contexto.

- [ ] **Step 2: Frontend — modelo**

```typescript
export type EstadoInstancia = 'PENDIENTE' | 'EN_CURSO' | 'APROBADA' | 'REPROBADA';

export interface InstanciaEvaluacion {
  id: number;
  nombre: string;
  orden: number;
  intento: number;
  estado: EstadoInstancia;
  puntajeAgregado: number | null;
}
```

- [ ] **Step 3: Frontend — método en el servicio + test**

En `solicitud-evaluacion.service.ts`:
```typescript
  listarInstancias(trabajoId: number): Observable<InstanciaEvaluacion[]> {
    return this.http.get<InstanciaEvaluacion[]>(
      `${this.api}/api/me/trabajos/${trabajoId}/instancias-evaluacion`);
  }
```
Test en el spec del servicio:
```typescript
  it('listarInstancias pega a /api/me/trabajos/{id}/instancias-evaluacion', () => {
    service.listarInstancias(7).subscribe();
    http.expectOne(`${api}/api/me/trabajos/7/instancias-evaluacion`).flush([]);
  });
```

- [ ] **Step 4: Verificar**

Run backend: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest='*MeTrabajo*,*InstanciaEvaluacion*'` (o `compile` + un SpringBootTest).
Run frontend: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit` → cero errores.

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/dto/InstanciaEvaluacionDto.java src/main/java/com/academconnect/controller/MeTrabajoController.java src/main/java/com/academconnect/service/InstanciaEvaluacionService.java src/test/java/com/academconnect/service/InstanciaEvaluacionServiceTests.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(4b): endpoint dueño-only de instancias de evaluación del trabajo"
git -C /home/ignacio/Projects/academconnect-web add src/app/features/mis-trabajos/instancia-evaluacion.models.ts src/app/features/mis-trabajos/solicitud-evaluacion.service.ts src/app/features/mis-trabajos/solicitud-evaluacion.service.spec.ts
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(4b): servicio frontend de instancias de evaluación"
```

---

## Task 8: Frontend — instancias en el detalle del trabajo

**Files:**
- Modify: `src/app/features/mis-trabajos/mis-trabajos-detalle-page/mis-trabajos-detalle-page.ts`
- Modify: `.../mis-trabajos-detalle-page.html`

**Interfaces:**
- Consumes: Task 7 (`listarInstancias`, modelo `InstanciaEvaluacion`).

- [ ] **Step 1: TS — cargar y exponer instancias**

Importar `InstanciaEvaluacion`; agregar `protected readonly instancias = signal<InstanciaEvaluacion[]>([]);` y un computed `instanciaActiva = computed(() => this.instancias().find((i) => i.estado === 'PENDIENTE' || i.estado === 'EN_CURSO') ?? null)`. En la carga del detalle (el `forkJoin`/subscribe), agregar `instancias: this.evaluacionService.listarInstancias(id).pipe(catchError(() => of<InstanciaEvaluacion[]>([])))` y `this.instancias.set(instancias);`.

- [ ] **Step 2: HTML — lista de instancias en el bloque "Banca evaluadora"**

Dentro del bloque de banca (donde hoy se muestran las solicitudes), agregar la lista de instancias:
```html
@if (instancias().length > 0) {
  <ul class="detalle__instancias">
    @for (ie of instancias(); track ie.id) {
      <li class="detalle__instancia">
        <span>{{ ie.nombre }} (intento {{ ie.intento }})</span>
        <span class="detalle__instancia-estado">{{ ie.estado }}</span>
        @if (ie.puntajeAgregado != null) { <span>· {{ ie.puntajeAgregado }}</span> }
      </li>
    }
  </ul>
}
```
El bloque de solicitar evaluadores sigue operando como hoy (la banca ya se dimensiona por la instancia activa en el backend). Opcional: mostrar el nombre de `instanciaActiva()` como contexto del formulario.

- [ ] **Step 3: SCSS mínimo (si hace falta)**

```scss
.detalle__instancias { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; }
.detalle__instancia { display: flex; gap: 0.5rem; align-items: baseline; }
```

- [ ] **Step 4: Verificar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit`
Expected: cero errores.

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect-web add src/app/features/mis-trabajos/mis-trabajos-detalle-page/
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(4b): lista de instancias de evaluación en el detalle del trabajo"
```

---

## Verificación final

- [ ] Backend: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test` → PASS (V29/V30 aplican; `@SpringBootTest` validan schema).
- [ ] Frontend: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit` → cero errores (correr specs en entorno con browser runner).
- [ ] Manual (TCC, tipo con 2 instancias × 2 evaluadores, secuencial): como estudiante con orientador asignado → se materializa TCC1; solicita 2 evaluadores; al completar las 2 evaluaciones de TCC1 con promedio ≥ umbral → TCC1 APROBADA y aparece TCC2; con promedio < umbral y maxIntentos>1 → TCC1 REPROBADA y aparece TCC1 intento 2; al aprobar la última instancia → trabajo APROBADO; al agotar maxIntentos → trabajo RECHAZADO. Tipo sin instancias → flujo de ronda única intacto.

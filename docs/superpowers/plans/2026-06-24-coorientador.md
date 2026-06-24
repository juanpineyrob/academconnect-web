# Solicitud de coorientador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el estudiante solicite un coorientador (profesor o externo) vía invitación + aceptar/rechazar, creando un `Coorientador` al aceptar.

**Architecture:** Flujo propio `SolicitudCoorientacion` (entidad + repo + DTOs + mapper + servicio + controller) paralelo al de orientador, reusando el enum `EstadoInvitacion`. Al aceptar se crea un `Coorientador` sin tocar `estado`/`orientador`. Frontend: servicio + bloque de solicitud en el detalle del trabajo (selector buscable de profesores+externos, sin ranking) + página de recibidas para el invitado.

**Tech Stack:** Backend Spring Boot/Java (JPA, MapStruct, Mockito/JUnit5) en `/home/ignacio/Projects/academconnect`. Frontend Angular v20 (signals, reactive forms) en `/home/ignacio/Projects/academconnect-web`.

## Global Constraints

- Dos repos: backend = `/home/ignacio/Projects/academconnect`, frontend = `/home/ignacio/Projects/academconnect-web`. Comandos `git` con `git -C <repo>`.
- Commits directos a `main` en ambos repos. **NO** agregar trailer `Co-Authored-By`. **NO** hacer push.
- `git add` siempre con rutas explícitas (hay archivos sin trackear no relacionados; no incluirlos).
- Backend: seguir el patrón de `InvitacionOrientacion*` (entity/repo/dto/mapper/service/controller/test).
- Frontend Angular: standalone (sin `standalone: true`), `ChangeDetectionStrategy.OnPush`, `inject()`, signals, `computed()`, control flow nativo (`@if`/`@for`), sin `ngClass`/`ngStyle`. Debe pasar AXE/WCAG AA.
- **El runner de tests de frontend usa Vitest en modo browser y NO está disponible en este entorno.** Para tareas de frontend: escribir igualmente el `.spec`, y usar `npx tsc -p tsconfig.app.json --noEmit` (debe dar cero errores) como gate. Intentar el runner una vez; si falla por browser, registrar el error exacto y seguir.
- Reglas de negocio (del spec): coorientador requiere `trabajo.orientador != null`, estado activo (no finalizado), máximo uno, una sola solicitud PENDIENTE; invitado profesor o externo, activo, distinto del orientador y del estudiante.

---

## Task 1: Entidad `SolicitudCoorientacion` + repositorios (backend)

**Files:**
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/domain/SolicitudCoorientacion.java`
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/repository/SolicitudCoorientacionRepository.java`
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/repository/CoorientadorRepository.java`

**Interfaces:**
- Produces: entidad `SolicitudCoorientacion` (campos `trabajo`, `invitado`, `estado`, `motivo`, `respuesta`, `resueltaEn`); `SolicitudCoorientacionRepository` con `existsByTrabajoIdAndEstado`, `findByTrabajoIdOrderByCreatedAtDesc`, `findByInvitadoIdAndEstadoOrderByCreatedAtDesc(Long,EstadoInvitacion,Pageable)`, `findByInvitadoIdAndEstadoNotOrderByCreatedAtDesc(Long,EstadoInvitacion,Pageable)`; `CoorientadorRepository.countByTrabajoId(Long)`.

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
@Table(name = "solicitud_coorientacion")
@Getter
@Setter
@NoArgsConstructor
public class SolicitudCoorientacion extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trabajo_id", nullable = false)
    private Trabajo trabajo;

    /** Invitado a coorientar: puede ser un Profesor o un Externo. */
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
import com.academconnect.domain.SolicitudCoorientacion;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SolicitudCoorientacionRepository extends JpaRepository<SolicitudCoorientacion, Long> {

    boolean existsByTrabajoIdAndEstado(Long trabajoId, EstadoInvitacion estado);

    List<SolicitudCoorientacion> findByTrabajoIdOrderByCreatedAtDesc(Long trabajoId);

    Page<SolicitudCoorientacion> findByInvitadoIdAndEstadoOrderByCreatedAtDesc(
            Long invitadoId, EstadoInvitacion estado, Pageable pageable);

    Page<SolicitudCoorientacion> findByInvitadoIdAndEstadoNotOrderByCreatedAtDesc(
            Long invitadoId, EstadoInvitacion estado, Pageable pageable);
}
```

- [ ] **Step 3: Agregar el conteo en `CoorientadorRepository`**

En `CoorientadorRepository.java`, debajo de `List<Coorientador> findByTrabajoId(Long trabajoId);` agregar:

```java
    long countByTrabajoId(Long trabajoId);
```

- [ ] **Step 4: Compilar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q compile`
Expected: BUILD SUCCESS.

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/domain/SolicitudCoorientacion.java src/main/java/com/academconnect/repository/SolicitudCoorientacionRepository.java src/main/java/com/academconnect/repository/CoorientadorRepository.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(coorientador): entidad SolicitudCoorientacion y repositorios"
```

---

## Task 2: DTOs + Mapper (backend)

**Files:**
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/SolicitudCoorientacionRequest.java`
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/SolicitudCoorientacionResponse.java`
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/mapper/SolicitudCoorientacionMapper.java`

**Interfaces:**
- Consumes: `SolicitudCoorientacion` (Task 1).
- Produces: `SolicitudCoorientacionRequest(trabajoId, usuarioId, motivo)`; `SolicitudCoorientacionResponse(id, trabajoId, trabajoTitulo, invitadoId, invitadoNombre, estado, motivo, respuesta, resueltaEn, createdAt)`; `SolicitudCoorientacionMapper.toResponse(...)`. Reusa `RespuestaInvitacionRequest` existente.

- [ ] **Step 1: Request DTO**

```java
package com.academconnect.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SolicitudCoorientacionRequest(
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

public record SolicitudCoorientacionResponse(
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

import com.academconnect.domain.SolicitudCoorientacion;
import com.academconnect.dto.SolicitudCoorientacionResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface SolicitudCoorientacionMapper {

    @Mapping(source = "trabajo.id", target = "trabajoId")
    @Mapping(source = "trabajo.titulo", target = "trabajoTitulo")
    @Mapping(source = "invitado.id", target = "invitadoId")
    @Mapping(source = "invitado.nombre", target = "invitadoNombre")
    SolicitudCoorientacionResponse toResponse(SolicitudCoorientacion entity);
}
```

- [ ] **Step 4: Compilar (genera el mapper)**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q compile`
Expected: BUILD SUCCESS (MapStruct genera `SolicitudCoorientacionMapperImpl`).

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/dto/SolicitudCoorientacionRequest.java src/main/java/com/academconnect/dto/SolicitudCoorientacionResponse.java src/main/java/com/academconnect/mapper/SolicitudCoorientacionMapper.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(coorientador): DTOs y mapper de SolicitudCoorientacion"
```

---

## Task 3: `SolicitudCoorientacionService` (backend, TDD)

**Files:**
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/service/SolicitudCoorientacionService.java`
- Test: `/home/ignacio/Projects/academconnect/src/test/java/com/academconnect/service/SolicitudCoorientacionServiceTests.java`

**Interfaces:**
- Consumes: Task 1 (entity/repos), Task 2 (DTOs/mapper). `UsuarioRepository`, `CoorientadorRepository`, `TrabajoRepository`, `ApplicationEventPublisher`. `Coorientador` (campos `trabajo`, `usuario`, `desde`). `EstadoTrabajo.esActivo()`. `Rol.PROFESOR`/`Rol.EXTERNO`. `Usuario.isActivo()`/`getRol()`.
- Produces: `crear(SolicitudCoorientacionRequest, Long estudianteId)`, `aceptar(Long, RespuestaInvitacionRequest, Long usuarioId)`, `rechazar(Long, RespuestaInvitacionRequest, Long usuarioId)`, `cancelar(Long, Long estudianteId)`, `listarRecibidasPaginadas(Long usuarioId, boolean soloPendientes, Pageable)`, `listarPorTrabajo(Long trabajoId)` → todos devuelven `SolicitudCoorientacionResponse` (o `Page`/`List`).

- [ ] **Step 1: Escribir los tests que fallan**

```java
package com.academconnect.service;

import com.academconnect.domain.Coorientador;
import com.academconnect.domain.EstadoInvitacion;
import com.academconnect.domain.EstadoTrabajo;
import com.academconnect.domain.Estudiante;
import com.academconnect.domain.Externo;
import com.academconnect.domain.Profesor;
import com.academconnect.domain.SolicitudCoorientacion;
import com.academconnect.domain.Trabajo;
import com.academconnect.dto.SolicitudCoorientacionRequest;
import com.academconnect.exception.BusinessException;
import com.academconnect.factories.UsuarioFactory;
import com.academconnect.mapper.SolicitudCoorientacionMapper;
import com.academconnect.repository.CoorientadorRepository;
import com.academconnect.repository.SolicitudCoorientacionRepository;
import com.academconnect.repository.TrabajoRepository;
import com.academconnect.repository.UsuarioRepository;
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
import org.springframework.context.ApplicationEventPublisher;

import java.util.Optional;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SolicitudCoorientacionServiceTests {

    @InjectMocks private SolicitudCoorientacionService service;
    @Mock private SolicitudCoorientacionRepository repository;
    @Mock private TrabajoRepository trabajoRepository;
    @Mock private UsuarioRepository usuarioRepository;
    @Mock private CoorientadorRepository coorientadorRepository;
    @Mock private SolicitudCoorientacionMapper mapper;
    @Mock private ApplicationEventPublisher events;

    private Estudiante estudiante;
    private Profesor orientador;
    private Profesor candidatoProfesor;
    private Externo candidatoExterno;
    private Trabajo trabajo;

    @BeforeEach
    void setup() {
        estudiante = UsuarioFactory.createEstudiante(10L, "alumno@x.uy");
        orientador = UsuarioFactory.createProfesor(20L, "orientador@x.uy");
        candidatoProfesor = UsuarioFactory.createProfesor(30L, "co@x.uy");
        candidatoExterno = UsuarioFactory.createExterno(40L, "externo@x.uy");

        trabajo = new Trabajo();
        trabajo.setId(100L);
        trabajo.setTitulo("Tesis");
        trabajo.setEstado(EstadoTrabajo.EN_DESARROLLO);
        trabajo.setEstudiante(estudiante);
        trabajo.setOrientador(orientador);

        Mockito.when(trabajoRepository.findById(100L)).thenReturn(Optional.of(trabajo));
        Mockito.when(usuarioRepository.findById(30L)).thenReturn(Optional.of(candidatoProfesor));
        Mockito.when(usuarioRepository.findById(40L)).thenReturn(Optional.of(candidatoExterno));
        Mockito.when(coorientadorRepository.countByTrabajoId(100L)).thenReturn(0L);
        Mockito.when(repository.existsByTrabajoIdAndEstado(100L, EstadoInvitacion.PENDIENTE)).thenReturn(false);
        Mockito.when(repository.save(Mockito.any())).thenAnswer(i -> i.getArgument(0));
    }

    private SolicitudCoorientacionRequest req(Long usuarioId) {
        return new SolicitudCoorientacionRequest(100L, usuarioId, "me gustaría que coorientes");
    }

    @Test
    void crear_okConProfesor() {
        service.crear(req(30L), estudiante.getId());
        ArgumentCaptor<SolicitudCoorientacion> cap = ArgumentCaptor.forClass(SolicitudCoorientacion.class);
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
    void crear_fallaSiYaTieneCoorientador() {
        Mockito.when(coorientadorRepository.countByTrabajoId(100L)).thenReturn(1L);
        Assertions.assertThrows(BusinessException.class, () -> service.crear(req(30L), estudiante.getId()));
    }

    @Test
    void crear_fallaSiYaHayPendiente() {
        Mockito.when(repository.existsByTrabajoIdAndEstado(100L, EstadoInvitacion.PENDIENTE)).thenReturn(true);
        Assertions.assertThrows(BusinessException.class, () -> service.crear(req(30L), estudiante.getId()));
    }

    @Test
    void crear_fallaSiInvitadoEsElOrientador() {
        Mockito.when(usuarioRepository.findById(20L)).thenReturn(Optional.of(orientador));
        Assertions.assertThrows(BusinessException.class, () -> service.crear(req(20L), estudiante.getId()));
    }

    @Test
    void aceptar_creaCoorientadorYNoTocaEstado() {
        SolicitudCoorientacion s = new SolicitudCoorientacion();
        s.setId(7L);
        s.setTrabajo(trabajo);
        s.setInvitado(candidatoProfesor);
        s.setEstado(EstadoInvitacion.PENDIENTE);
        Mockito.when(repository.findById(7L)).thenReturn(Optional.of(s));

        service.aceptar(7L, null, candidatoProfesor.getId());

        Assertions.assertEquals(EstadoInvitacion.ACEPTADA, s.getEstado());
        Assertions.assertEquals(EstadoTrabajo.EN_DESARROLLO, trabajo.getEstado()); // sin cambios
        ArgumentCaptor<Coorientador> cap = ArgumentCaptor.forClass(Coorientador.class);
        Mockito.verify(coorientadorRepository).save(cap.capture());
        Assertions.assertEquals(candidatoProfesor.getId(), cap.getValue().getUsuario().getId());
        Assertions.assertEquals(100L, cap.getValue().getTrabajo().getId());
        Assertions.assertNotNull(cap.getValue().getDesde());
    }

    @Test
    void aceptar_fallaSiNoEsElInvitado() {
        SolicitudCoorientacion s = new SolicitudCoorientacion();
        s.setId(7L);
        s.setTrabajo(trabajo);
        s.setInvitado(candidatoProfesor);
        s.setEstado(EstadoInvitacion.PENDIENTE);
        Mockito.when(repository.findById(7L)).thenReturn(Optional.of(s));
        Assertions.assertThrows(BusinessException.class, () -> service.aceptar(7L, null, 999L));
    }

    @Test
    void rechazar_marcaRechazada() {
        SolicitudCoorientacion s = new SolicitudCoorientacion();
        s.setId(7L);
        s.setTrabajo(trabajo);
        s.setInvitado(candidatoProfesor);
        s.setEstado(EstadoInvitacion.PENDIENTE);
        Mockito.when(repository.findById(7L)).thenReturn(Optional.of(s));
        service.rechazar(7L, null, candidatoProfesor.getId());
        Assertions.assertEquals(EstadoInvitacion.RECHAZADA, s.getEstado());
        Mockito.verify(coorientadorRepository, Mockito.never()).save(Mockito.any());
    }

    @Test
    void cancelar_soloDueno() {
        SolicitudCoorientacion s = new SolicitudCoorientacion();
        s.setId(7L);
        s.setTrabajo(trabajo);
        s.setInvitado(candidatoProfesor);
        s.setEstado(EstadoInvitacion.PENDIENTE);
        Mockito.when(repository.findById(7L)).thenReturn(Optional.of(s));
        Assertions.assertThrows(BusinessException.class, () -> service.cancelar(7L, 999L));
        service.cancelar(7L, estudiante.getId());
        Assertions.assertEquals(EstadoInvitacion.CANCELADA, s.getEstado());
    }
}
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=SolicitudCoorientacionServiceTests`
Expected: FAIL — `SolicitudCoorientacionService` no existe.

- [ ] **Step 3: Implementar el servicio**

> Antes de codear, confirmá la firma del constructor de actividad: mirá cómo `InvitacionOrientacionService` arma `ActividadEvent.of(...)` y replicá ese patrón. Si `TipoActividad` no tiene constantes de coorientación, usá las de orientación más cercanas o registrá el evento de forma equivalente; si no podés resolverlo con certeza, dejá el `events.publishEvent(...)` igual que orientación pero con la entidad/datos de coorientación y reportá la duda como DONE_WITH_CONCERNS.

```java
package com.academconnect.service;

import com.academconnect.domain.Coorientador;
import com.academconnect.domain.EstadoInvitacion;
import com.academconnect.domain.Rol;
import com.academconnect.domain.SolicitudCoorientacion;
import com.academconnect.domain.Usuario;
import com.academconnect.dto.RespuestaInvitacionRequest;
import com.academconnect.dto.SolicitudCoorientacionRequest;
import com.academconnect.dto.SolicitudCoorientacionResponse;
import com.academconnect.exception.BusinessException;
import com.academconnect.exception.ResourceNotFoundException;
import com.academconnect.mapper.SolicitudCoorientacionMapper;
import com.academconnect.repository.CoorientadorRepository;
import com.academconnect.repository.SolicitudCoorientacionRepository;
import com.academconnect.repository.TrabajoRepository;
import com.academconnect.repository.UsuarioRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class SolicitudCoorientacionService {

    private final SolicitudCoorientacionRepository repository;
    private final TrabajoRepository trabajoRepository;
    private final UsuarioRepository usuarioRepository;
    private final CoorientadorRepository coorientadorRepository;
    private final SolicitudCoorientacionMapper mapper;
    private final ApplicationEventPublisher events;

    @Transactional
    public SolicitudCoorientacionResponse crear(SolicitudCoorientacionRequest request, Long estudianteId) {
        var trabajo = trabajoRepository.findById(request.trabajoId())
                .orElseThrow(() -> new ResourceNotFoundException("Trabajo", request.trabajoId()));
        if (trabajo.getEstudiante() == null || !trabajo.getEstudiante().getId().equals(estudianteId)) {
            throw new BusinessException("No sos el dueño de este trabajo");
        }
        if (trabajo.getOrientador() == null) {
            throw new BusinessException("El trabajo aún no tiene orientador");
        }
        if (!trabajo.getEstado().esActivo()) {
            throw new BusinessException("No se puede solicitar coorientador en un trabajo finalizado");
        }
        if (coorientadorRepository.countByTrabajoId(trabajo.getId()) > 0) {
            throw new BusinessException("El trabajo ya tiene coorientador");
        }
        if (repository.existsByTrabajoIdAndEstado(trabajo.getId(), EstadoInvitacion.PENDIENTE)) {
            throw new BusinessException("Ya hay una solicitud de coorientación pendiente");
        }
        var invitado = usuarioRepository.findById(request.usuarioId())
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", request.usuarioId()));
        if (!invitado.isActivo()) {
            throw new BusinessException("El usuario no está activo");
        }
        if (invitado.getRol() != Rol.PROFESOR && invitado.getRol() != Rol.EXTERNO) {
            throw new BusinessException("El coorientador debe ser un profesor o un externo");
        }
        if (invitado.getId().equals(trabajo.getOrientador().getId())) {
            throw new BusinessException("El coorientador no puede ser el orientador");
        }
        if (invitado.getId().equals(estudianteId)) {
            throw new BusinessException("No podés invitarte a vos mismo");
        }

        var solicitud = new SolicitudCoorientacion();
        solicitud.setTrabajo(trabajo);
        solicitud.setInvitado(invitado);
        solicitud.setEstado(EstadoInvitacion.PENDIENTE);
        solicitud.setMotivo(request.motivo());
        var saved = repository.save(solicitud);
        return mapper.toResponse(saved);
    }

    @Transactional
    public SolicitudCoorientacionResponse aceptar(
            Long solicitudId, RespuestaInvitacionRequest request, Long usuarioId) {
        var s = repository.findById(solicitudId)
                .orElseThrow(() -> new ResourceNotFoundException("SolicitudCoorientacion", solicitudId));
        if (!s.getInvitado().getId().equals(usuarioId)) {
            throw new BusinessException("Solo el invitado puede aceptar");
        }
        if (s.getEstado() != EstadoInvitacion.PENDIENTE) {
            throw new BusinessException("La solicitud ya fue resuelta");
        }
        var trabajo = s.getTrabajo();
        if (trabajo.getOrientador() == null || !trabajo.getEstado().esActivo()
                || coorientadorRepository.countByTrabajoId(trabajo.getId()) > 0) {
            throw new BusinessException("La solicitud ya no es válida para este trabajo");
        }

        s.setEstado(EstadoInvitacion.ACEPTADA);
        s.setRespuesta(request != null ? request.respuesta() : null);
        s.setResueltaEn(Instant.now());

        var coorientador = new Coorientador();
        coorientador.setTrabajo(trabajo);
        coorientador.setUsuario(s.getInvitado());
        coorientador.setDesde(LocalDate.now());
        coorientadorRepository.save(coorientador);

        return mapper.toResponse(repository.save(s));
    }

    @Transactional
    public SolicitudCoorientacionResponse rechazar(
            Long solicitudId, RespuestaInvitacionRequest request, Long usuarioId) {
        var s = repository.findById(solicitudId)
                .orElseThrow(() -> new ResourceNotFoundException("SolicitudCoorientacion", solicitudId));
        if (!s.getInvitado().getId().equals(usuarioId)) {
            throw new BusinessException("Solo el invitado puede rechazar");
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
    public SolicitudCoorientacionResponse cancelar(Long solicitudId, Long estudianteId) {
        var s = repository.findById(solicitudId)
                .orElseThrow(() -> new ResourceNotFoundException("SolicitudCoorientacion", solicitudId));
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

    public Page<SolicitudCoorientacionResponse> listarRecibidasPaginadas(
            Long usuarioId, boolean soloPendientes, Pageable pageable) {
        Page<SolicitudCoorientacion> page = soloPendientes
                ? repository.findByInvitadoIdAndEstadoOrderByCreatedAtDesc(
                        usuarioId, EstadoInvitacion.PENDIENTE, pageable)
                : repository.findByInvitadoIdAndEstadoNotOrderByCreatedAtDesc(
                        usuarioId, EstadoInvitacion.PENDIENTE, pageable);
        return page.map(mapper::toResponse);
    }

    public List<SolicitudCoorientacionResponse> listarPorTrabajo(Long trabajoId) {
        if (!trabajoRepository.existsById(trabajoId)) {
            throw new ResourceNotFoundException("Trabajo", trabajoId);
        }
        return repository.findByTrabajoIdOrderByCreatedAtDesc(trabajoId)
                .stream().map(mapper::toResponse).toList();
    }
}
```

> Nota: si `Coorientador` no tiene setters `setTrabajo`/`setUsuario`/`setDesde` con esos nombres, ajustá según la entidad real (la entidad usa Lombok `@Setter`, así que deberían existir). Removí el `events.publishEvent` para no inventar `TipoActividad`; si querés actividad, agregalo siguiendo el patrón de orientación.

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=SolicitudCoorientacionServiceTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/service/SolicitudCoorientacionService.java src/test/java/com/academconnect/service/SolicitudCoorientacionServiceTests.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(coorientador): servicio de solicitud de coorientación"
```

---

## Task 4: `SolicitudCoorientacionController` (backend)

**Files:**
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/controller/SolicitudCoorientacionController.java`

**Interfaces:**
- Consumes: Task 3 (servicio), DTOs (Task 2), `UsuarioRepository`.
- Produces: endpoints REST bajo `/api/solicitudes-coorientacion`.

- [ ] **Step 1: Crear el controller**

```java
package com.academconnect.controller;

import com.academconnect.domain.EstadoInvitacion;
import com.academconnect.dto.RespuestaInvitacionRequest;
import com.academconnect.dto.SolicitudCoorientacionRequest;
import com.academconnect.dto.SolicitudCoorientacionResponse;
import com.academconnect.exception.ResourceNotFoundException;
import com.academconnect.repository.UsuarioRepository;
import com.academconnect.service.SolicitudCoorientacionService;
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
@RequestMapping("/api/solicitudes-coorientacion")
@RequiredArgsConstructor
public class SolicitudCoorientacionController {

    private final SolicitudCoorientacionService service;
    private final UsuarioRepository usuarioRepository;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ESTUDIANTE')")
    public SolicitudCoorientacionResponse crear(
            @Valid @RequestBody SolicitudCoorientacionRequest request, Authentication authn) {
        return service.crear(request, currentUserId(authn));
    }

    @PostMapping("/{id}/aceptar")
    @PreAuthorize("hasRole('PROFESOR') or hasRole('EXTERNO')")
    public SolicitudCoorientacionResponse aceptar(
            @PathVariable Long id,
            @RequestBody(required = false) RespuestaInvitacionRequest request,
            Authentication authn) {
        return service.aceptar(id, request, currentUserId(authn));
    }

    @PostMapping("/{id}/rechazar")
    @PreAuthorize("hasRole('PROFESOR') or hasRole('EXTERNO')")
    public SolicitudCoorientacionResponse rechazar(
            @PathVariable Long id,
            @RequestBody(required = false) RespuestaInvitacionRequest request,
            Authentication authn) {
        return service.rechazar(id, request, currentUserId(authn));
    }

    @PostMapping("/{id}/cancelar")
    @PreAuthorize("hasRole('ESTUDIANTE')")
    public SolicitudCoorientacionResponse cancelar(@PathVariable Long id, Authentication authn) {
        return service.cancelar(id, currentUserId(authn));
    }

    @GetMapping
    @PreAuthorize("hasRole('PROFESOR') or hasRole('EXTERNO')")
    public Page<SolicitudCoorientacionResponse> recibidas(
            @RequestParam(required = false) EstadoInvitacion estado,
            @PageableDefault(size = 10, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable,
            Authentication authn) {
        return service.listarRecibidasPaginadas(
                currentUserId(authn), estado == EstadoInvitacion.PENDIENTE, pageable);
    }

    @GetMapping("/trabajos/{trabajoId}")
    @PreAuthorize("isAuthenticated()")
    public List<SolicitudCoorientacionResponse> porTrabajo(@PathVariable Long trabajoId) {
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

- [ ] **Step 2: Compilar y correr los tests del servicio (regresión)**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest='*Coorientacion*'`
Expected: BUILD SUCCESS / PASS.

- [ ] **Step 3: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/controller/SolicitudCoorientacionController.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(coorientador): endpoints de solicitud de coorientación"
```

---

## Task 5: Servicio + modelos frontend (TDD)

**Files:**
- Create: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/solicitud-coorientacion.models.ts`
- Create: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/solicitud-coorientacion.service.ts`
- Test: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/solicitud-coorientacion.service.spec.ts`

**Interfaces:**
- Produces: `SolicitudCoorientacionService` con `crear`, `aceptar`, `rechazar`, `cancelar`, `listarRecibidas`, `listarPorTrabajo`, `listarCandidatos`; modelos `SolicitudCoorientacion`, `SolicitudCoorientacionRequest`, `CandidatoCoorientador`.

- [ ] **Step 1: Modelos**

```typescript
import { EstadoInvitacion } from './invitacion-orientacion.models';

export interface SolicitudCoorientacion {
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

export interface SolicitudCoorientacionRequest {
  trabajoId: number;
  usuarioId: number;
  motivo?: string | null;
}

export interface CandidatoCoorientador {
  id: number;
  nombre: string;
  email: string;
  rol: 'PROFESOR' | 'EXTERNO';
}
```

- [ ] **Step 2: Escribir el test que falla**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SolicitudCoorientacionService } from './solicitud-coorientacion.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('SolicitudCoorientacionService', () => {
  let service: SolicitudCoorientacionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SolicitudCoorientacionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('crear pega POST a /api/solicitudes-coorientacion', () => {
    service.crear({ trabajoId: 7, usuarioId: 30, motivo: 'x' }).subscribe();
    const req = http.expectOne(`${api}/api/solicitudes-coorientacion`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('listarCandidatos combina profesores y externos y marca el rol', () => {
    let result: { id: number; rol: string }[] = [];
    service.listarCandidatos().subscribe((c) => (result = c));
    http.expectOne(`${api}/api/profesores`).flush([{ id: 1, nombre: 'P', email: 'p@x', activo: true }]);
    http.expectOne(`${api}/api/externos`).flush([{ id: 2, nombre: 'E', email: 'e@x', activo: true }]);
    expect(result).toEqual([
      { id: 1, nombre: 'P', email: 'p@x', rol: 'PROFESOR' },
      { id: 2, nombre: 'E', email: 'e@x', rol: 'EXTERNO' },
    ]);
  });
});
```

- [ ] **Step 3: Correr el test para verlo fallar (o registrar runner-unavailable)**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --watch=false --include='**/solicitud-coorientacion.service.spec.ts'`
Si el runner de browser no está disponible, registrá el error y seguí con el typecheck (Step 5).

- [ ] **Step 4: Implementar el servicio**

```typescript
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';

import { environment } from '@env/environment';
import { Page } from '@core/http/page';
import { RespuestaInvitacionRequest, EstadoInvitacion } from './invitacion-orientacion.models';
import {
  CandidatoCoorientador,
  SolicitudCoorientacion,
  SolicitudCoorientacionRequest,
} from './solicitud-coorientacion.models';

interface UsuarioListItem { id: number; nombre: string; email: string; activo: boolean; }

@Injectable({ providedIn: 'root' })
export class SolicitudCoorientacionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;
  private readonly base = `${this.api}/api/solicitudes-coorientacion`;

  crear(payload: SolicitudCoorientacionRequest): Observable<SolicitudCoorientacion> {
    return this.http.post<SolicitudCoorientacion>(this.base, payload);
  }

  aceptar(id: number, body?: RespuestaInvitacionRequest): Observable<SolicitudCoorientacion> {
    return this.http.post<SolicitudCoorientacion>(`${this.base}/${id}/aceptar`, body ?? {});
  }

  rechazar(id: number, body?: RespuestaInvitacionRequest): Observable<SolicitudCoorientacion> {
    return this.http.post<SolicitudCoorientacion>(`${this.base}/${id}/rechazar`, body ?? {});
  }

  cancelar(id: number): Observable<SolicitudCoorientacion> {
    return this.http.post<SolicitudCoorientacion>(`${this.base}/${id}/cancelar`, {});
  }

  listarRecibidas(
    estado: EstadoInvitacion | undefined, page: number, size: number,
  ): Observable<Page<SolicitudCoorientacion>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (estado) params = params.set('estado', estado);
    return this.http.get<Page<SolicitudCoorientacion>>(this.base, { params });
  }

  listarPorTrabajo(trabajoId: number): Observable<SolicitudCoorientacion[]> {
    return this.http.get<SolicitudCoorientacion[]>(`${this.base}/trabajos/${trabajoId}`);
  }

  listarCandidatos(): Observable<CandidatoCoorientador[]> {
    return forkJoin({
      profesores: this.http.get<UsuarioListItem[]>(`${this.api}/api/profesores`),
      externos: this.http.get<UsuarioListItem[]>(`${this.api}/api/externos`),
    }).pipe(
      map(({ profesores, externos }) => [
        ...profesores.map((p) => ({ id: p.id, nombre: p.nombre, email: p.email, rol: 'PROFESOR' as const })),
        ...externos.map((e) => ({ id: e.id, nombre: e.nombre, email: e.email, rol: 'EXTERNO' as const })),
      ]),
    );
  }
}
```

> Si `RespuestaInvitacionRequest`/`EstadoInvitacion` no están exportados desde `invitacion-orientacion.models`, verificá el nombre exacto del export y ajustá el import.

- [ ] **Step 5: Verificar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit`
Expected: cero errores. (Y el spec en verde si hay browser runner.)

- [ ] **Step 6: Commit**

```bash
git -C /home/ignacio/Projects/academconnect-web add src/app/features/mis-trabajos/solicitud-coorientacion.models.ts src/app/features/mis-trabajos/solicitud-coorientacion.service.ts src/app/features/mis-trabajos/solicitud-coorientacion.service.spec.ts
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(coorientador): servicio y modelos frontend"
```

---

## Task 6: Form de solicitud + integración en el detalle (frontend)

**Files:**
- Create: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/components/solicitar-coorientador-form/solicitar-coorientador-form.ts`
- Create: `.../solicitar-coorientador-form/solicitar-coorientador-form.html`
- Create: `.../solicitar-coorientador-form/solicitar-coorientador-form.scss`
- Test: `.../solicitar-coorientador-form/solicitar-coorientador-form.spec.ts`
- Modify: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/mis-trabajos-detalle-page/mis-trabajos-detalle-page.ts`
- Modify: `.../mis-trabajos-detalle-page/mis-trabajos-detalle-page.html`

**Interfaces:**
- Consumes: Task 5 (`SolicitudCoorientacionService`, `CandidatoCoorientador`).
- Produces: componente `ac-solicitar-coorientador-form` con `input.required<number>() orientadorId`, `input<boolean>() submitting`, `output<{usuarioId:number; motivo:string|null}>() enviar`.

- [ ] **Step 1: Escribir el spec del form (falla)**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SolicitarCoorientadorForm } from './solicitar-coorientador-form';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('SolicitarCoorientadorForm', () => {
  let fixture: ComponentFixture<SolicitarCoorientadorForm>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SolicitarCoorientadorForm],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SolicitarCoorientadorForm);
    fixture.componentRef.setInput('orientadorId', 20);
    fixture.detectChanges();
    http.expectOne(`${api}/api/profesores`).flush([
      { id: 20, nombre: 'Orientador', email: 'o@x', activo: true },
      { id: 30, nombre: 'Profe Co', email: 'c@x', activo: true },
    ]);
    http.expectOne(`${api}/api/externos`).flush([
      { id: 40, nombre: 'Externo Co', email: 'e@x', activo: true },
    ]);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('excluye al orientador de los candidatos', () => {
    const el: HTMLElement = fixture.nativeElement;
    const items = el.querySelectorAll('.coorientador-form__item');
    expect(items.length).toBe(2); // 30 y 40, no 20
  });

  it('el buscador filtra por nombre', () => {
    const cmp = fixture.componentInstance as unknown as { query: { set: (v: string) => void } };
    cmp.query.set('externo');
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.coorientador-form__item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Externo Co');
  });

  it('al seleccionar y enviar emite { usuarioId, motivo }', () => {
    const cmp = fixture.componentInstance as unknown as {
      seleccionar: (id: number) => void; onSubmit: () => void;
      enviar: { subscribe: (cb: (v: { usuarioId: number; motivo: string | null }) => void) => void };
    };
    let emitted: { usuarioId: number; motivo: string | null } | undefined;
    cmp.enviar.subscribe((v) => (emitted = v));
    cmp.seleccionar(40);
    cmp.onSubmit();
    expect(emitted).toEqual({ usuarioId: 40, motivo: null });
  });
});
```

- [ ] **Step 2: Correr el spec (falla o runner-unavailable)**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --watch=false --include='**/solicitar-coorientador-form.spec.ts'`
Si no hay browser runner, registralo y seguí con el typecheck.

- [ ] **Step 3: Crear el componente TS**

```typescript
import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { SolicitudCoorientacionService } from '../../solicitud-coorientacion.service';
import { CandidatoCoorientador } from '../../solicitud-coorientacion.models';

@Component({
  selector: 'ac-solicitar-coorientador-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button],
  templateUrl: './solicitar-coorientador-form.html',
  styleUrl: './solicitar-coorientador-form.scss',
})
export class SolicitarCoorientadorForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SolicitudCoorientacionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly orientadorId = input.required<number>();
  readonly submitting = input<boolean>(false);
  readonly enviar = output<{ usuarioId: number; motivo: string | null }>();

  protected readonly candidatos = signal<CandidatoCoorientador[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly query = signal<string>('');

  protected readonly form = this.fb.nonNullable.group({
    usuarioId: [null as number | null, Validators.required],
    motivo: [''],
  });

  protected readonly filtrados = computed(() => {
    const q = this.query().trim().toLowerCase();
    const oid = this.orientadorId();
    const base = this.candidatos().filter((c) => c.id !== oid);
    return q ? base.filter((c) => c.nombre.toLowerCase().includes(q)) : base;
  });

  ngOnInit(): void {
    this.service.listarCandidatos()
      .pipe(catchError(() => of<CandidatoCoorientador[]>([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((cs) => { this.candidatos.set(cs); this.loading.set(false); });
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
<form class="coorientador-form" [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>
  @if (loading()) {
    <span class="coorientador-form__hint" role="status">Cargando candidatos…</span>
  } @else {
    <fieldset class="coorientador-form__field">
      <legend class="coorientador-form__label">Elegí un profesor o externo</legend>
      <input type="search" class="coorientador-form__search" placeholder="Buscar por nombre…"
             aria-label="Buscar candidato por nombre"
             [value]="query()" (input)="onQuery($any($event.target).value)" />
      <ul class="coorientador-form__list">
        @for (c of filtrados(); track c.id) {
          <li class="coorientador-form__item">
            <label class="coorientador-form__item-label">
              <input type="radio" formControlName="usuarioId" [value]="c.id" (change)="seleccionar(c.id)" />
              <span class="coorientador-form__item-nombre">{{ c.nombre }}</span>
              <span class="coorientador-form__item-rol">{{ c.rol === 'PROFESOR' ? 'Profesor' : 'Externo' }}</span>
            </label>
          </li>
        } @empty {
          <li class="coorientador-form__hint">No hay candidatos que coincidan.</li>
        }
      </ul>
    </fieldset>
  }

  <label class="coorientador-form__field">
    <span class="coorientador-form__label">Mensaje (opcional)</span>
    <textarea formControlName="motivo" rows="3" maxlength="1000"
              class="coorientador-form__textarea"
              placeholder="Contale por qué te gustaría que cooriente tu trabajo."></textarea>
  </label>

  <div class="coorientador-form__actions">
    <ac-button size="sm" type="submit" [loading]="submitting()"
               [disabled]="submitting() || form.invalid">Enviar solicitud</ac-button>
  </div>
</form>
```

- [ ] **Step 5: Crear el SCSS**

```scss
.coorientador-form__list { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow-y: auto; }
.coorientador-form__item-rol { margin-inline-start: 0.5rem; font-size: 0.85em; opacity: 0.7; }
```

- [ ] **Step 6: Integrar en el detalle del trabajo**

En `mis-trabajos-detalle-page.ts`:
- Agregar imports:
```typescript
import { SolicitarCoorientadorForm } from '../components/solicitar-coorientador-form/solicitar-coorientador-form';
import { SolicitudCoorientacionService } from '../solicitud-coorientacion.service';
import { SolicitudCoorientacion } from '../solicitud-coorientacion.models';
```
- Agregar `SolicitarCoorientadorForm` al array `imports` del `@Component`.
- Inyectar el servicio y agregar estado (junto a los otros `inject`/signals):
```typescript
  private readonly coorientacionService = inject(SolicitudCoorientacionService);
  protected readonly solicitudesCoorientacion = signal<SolicitudCoorientacion[]>([]);
  protected readonly submittingCoorientacion = signal<boolean>(false);
```
- Computeds (junto a `invitacionPendiente`/`puedeInvitar`):
```typescript
  protected readonly coorientacionPendiente = computed(() =>
    this.solicitudesCoorientacion().find((s) => s.estado === 'PENDIENTE') ?? null);
  protected readonly coorientadorAsignado = computed(() =>
    this.solicitudesCoorientacion().find((s) => s.estado === 'ACEPTADA') ?? null);
  protected readonly puedeSolicitarCoorientador = computed(() => {
    const t = this.trabajo();
    return !!t && t.orientadorId != null
      && t.estado !== 'APROBADO' && t.estado !== 'RECHAZADO' && t.estado !== 'CANCELADO'
      && this.coorientacionPendiente() == null && this.coorientadorAsignado() == null;
  });
```
- En el método que carga el detalle (donde hace `forkJoin`/subscribe con `trabajo` e `invitaciones`), agregar la carga de solicitudes de coorientación. Si usa `forkJoin({ trabajo, invitaciones })`, agregá `coorientaciones: this.coorientacionService.listarPorTrabajo(id).pipe(catchError(() => of<SolicitudCoorientacion[]>([])))` y en el subscribe `this.solicitudesCoorientacion.set(coorientaciones)`. (Asegurate de tener importados `catchError`/`of` — ya se usan en el archivo.)
- Handler de envío:
```typescript
  protected onSolicitarCoorientador(payload: { usuarioId: number; motivo: string | null }): void {
    const t = this.trabajo();
    if (!t) return;
    this.submittingCoorientacion.set(true);
    this.coorientacionService.crear({ trabajoId: t.id, usuarioId: payload.usuarioId, motivo: payload.motivo })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => { this.submittingCoorientacion.set(false); this.solicitudesCoorientacion.update((prev) => [s, ...prev]); },
        error: () => { this.submittingCoorientacion.set(false); },
      });
  }
```

En `mis-trabajos-detalle-page.html`, después del bloque de "Invitar orientador" (el `@if (puedeInvitar())`/`@else if (invitacionPendiente())`), agregar:
```html
    @if (coorientadorAsignado(); as co) {
      <ac-card padding="md">
        <h2 class="detalle__h2">Coorientador</h2>
        <p>{{ co.invitadoNombre }}</p>
      </ac-card>
    } @else if (coorientacionPendiente(); as pend) {
      <ac-card padding="md">
        <h2 class="detalle__h2">Coorientador</h2>
        <p class="detalle__hint">Solicitud pendiente a {{ pend.invitadoNombre }}.</p>
      </ac-card>
    } @else if (puedeSolicitarCoorientador()) {
      <ac-card padding="md">
        <h2 class="detalle__h2">Solicitar coorientador</h2>
        <ac-solicitar-coorientador-form
          [orientadorId]="t.orientadorId!"
          [submitting]="submittingCoorientacion()"
          (enviar)="onSolicitarCoorientador($event)" />
      </ac-card>
    }
```
> Nota: el `t` es la variable del `@if (trabajo(); as t)` que envuelve el contenido del detalle. Verificá el nombre real de esa variable en el HTML y usá ese. Confirmá también que `TrabajoListItem` tiene `orientadorId` (se usa en `puedeInvitar`).

- [ ] **Step 7: Verificar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit`
Expected: cero errores.

- [ ] **Step 8: Commit**

```bash
git -C /home/ignacio/Projects/academconnect-web add src/app/features/mis-trabajos/components/solicitar-coorientador-form/ src/app/features/mis-trabajos/mis-trabajos-detalle-page/
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(coorientador): bloque de solicitud en el detalle del trabajo"
```

---

## Task 7: Página de solicitudes recibidas para el invitado (frontend)

**Files:**
- Create: `/home/ignacio/Projects/academconnect-web/src/app/features/coorientaciones/coorientaciones-recibidas-page/coorientaciones-recibidas-page.ts`
- Create: `.../coorientaciones-recibidas-page/coorientaciones-recibidas-page.html`
- Create: `.../coorientaciones-recibidas-page/coorientaciones-recibidas-page.scss`
- Create: `/home/ignacio/Projects/academconnect-web/src/app/features/coorientaciones/coorientaciones.routes.ts`
- Modify: `/home/ignacio/Projects/academconnect-web/src/app/app.routes.ts` (registrar la ruta)

**Interfaces:**
- Consumes: Task 5 (`SolicitudCoorientacionService`, `SolicitudCoorientacion`).

- [ ] **Step 1: Crear la página TS** (mismo patrón que `invitaciones-recibidas-page`, con el servicio de coorientación)

```typescript
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { isProblemDetail } from '@core/http/problem-detail';
import { SolicitudCoorientacionService } from '@features/mis-trabajos/solicitud-coorientacion.service';
import { SolicitudCoorientacion } from '@features/mis-trabajos/solicitud-coorientacion.models';

type Filtro = 'PENDIENTE' | 'HISTORICO';
const PAGE_SIZE = 10;

@Component({
  selector: 'ac-coorientaciones-recibidas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card],
  templateUrl: './coorientaciones-recibidas-page.html',
  styleUrl: './coorientaciones-recibidas-page.scss',
})
export class CoorientacionesRecibidasPage {
  private readonly service = inject(SolicitudCoorientacionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly solicitudes = signal<SolicitudCoorientacion[]>([]);
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

  protected aceptar(s: SolicitudCoorientacion): void {
    this.actionId.set(s.id);
    this.service.aceptar(s.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.actionId.set(null); this.cargar(); },
        error: (err: HttpErrorResponse) => { this.actionId.set(null); this.error.set(this.mapError(err)); },
      });
  }

  protected rechazar(s: SolicitudCoorientacion): void {
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
<section class="coorientaciones">
  <header class="coorientaciones__header">
    <h1 class="coorientaciones__title">Solicitudes de coorientación</h1>
    <div class="coorientaciones__tabs" role="tablist">
      <ac-button size="sm" [variant]="filtro() === 'PENDIENTE' ? 'primary' : 'ghost'"
                 (click)="setFiltro('PENDIENTE')">Pendientes</ac-button>
      <ac-button size="sm" [variant]="filtro() === 'HISTORICO' ? 'primary' : 'ghost'"
                 (click)="setFiltro('HISTORICO')">Histórico</ac-button>
    </div>
  </header>

  @if (error(); as e) { <p class="coorientaciones__error" role="alert">{{ e }}</p> }

  @if (loading()) {
    <p role="status">Cargando…</p>
  } @else if (solicitudes().length === 0) {
    <p>No hay solicitudes.</p>
  } @else {
    <ul class="coorientaciones__list">
      @for (s of solicitudes(); track s.id) {
        <li>
          <ac-card padding="md">
            <h2 class="coorientaciones__h2">{{ s.trabajoTitulo }}</h2>
            @if (s.motivo) { <p>{{ s.motivo }}</p> }
            @if (s.estado === 'PENDIENTE') {
              <div class="coorientaciones__actions">
                <ac-button size="sm" [loading]="actionId() === s.id" (click)="aceptar(s)">Aceptar</ac-button>
                <ac-button size="sm" variant="ghost" [loading]="actionId() === s.id" (click)="rechazar(s)">Rechazar</ac-button>
              </div>
            } @else {
              <p class="coorientaciones__estado">{{ s.estado }}</p>
            }
          </ac-card>
        </li>
      }
    </ul>
    <div class="coorientaciones__pager">
      <ac-button size="sm" variant="ghost" [disabled]="first()" (click)="paginaAnterior()">Anterior</ac-button>
      <ac-button size="sm" variant="ghost" [disabled]="last()" (click)="paginaSiguiente()">Siguiente</ac-button>
    </div>
  }
</section>
```

- [ ] **Step 3: SCSS mínimo**

```scss
.coorientaciones__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
.coorientaciones__tabs, .coorientaciones__actions, .coorientaciones__pager { display: flex; gap: 0.5rem; }
```

- [ ] **Step 4: Ruta del feature**

`coorientaciones.routes.ts`:
```typescript
import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { roleGuard } from '@core/auth/role.guard';

export const COORIENTACIONES_ROUTES: Routes = [
  {
    path: 'solicitudes-coorientacion',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['PROFESOR', 'EXTERNO'] },
    loadComponent: () =>
      import('./coorientaciones-recibidas-page/coorientaciones-recibidas-page')
        .then((m) => m.CoorientacionesRecibidasPage),
    title: 'Solicitudes de coorientación · AcademConnect',
  },
];
```

- [ ] **Step 5: Registrar en `app.routes.ts`**

Leé `app.routes.ts` y mirá cómo se registran las `INVITACIONES_ROUTES` (probablemente con spread dentro de una ruta de layout autenticado). Registrá `COORIENTACIONES_ROUTES` de la misma forma, en el mismo lugar:
```typescript
import { COORIENTACIONES_ROUTES } from '@features/coorientaciones/coorientaciones.routes';
// ...
  ...COORIENTACIONES_ROUTES,
```
(Usá el mismo patrón/imports/alias que usa la línea de `INVITACIONES_ROUTES`.)

- [ ] **Step 6: Verificar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit`
Expected: cero errores.

- [ ] **Step 7: (Opcional) link en el sidebar**

Si querés que el invitado acceda desde el menú, agregá un item a la sección PROFESOR (y EXTERNO si existe) en `src/app/layout/sidebar/sidebar.ts` apuntando a `/solicitudes-coorientacion`, siguiendo el formato de los items existentes. Si no, la ruta queda accesible por URL directa.

- [ ] **Step 8: Commit**

```bash
git -C /home/ignacio/Projects/academconnect-web add src/app/features/coorientaciones/ src/app/app.routes.ts
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(coorientador): página de solicitudes recibidas para el invitado"
```

---

## Verificación final

- [ ] Backend: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test` → PASS.
- [ ] Frontend: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit` → cero errores. (Correr los specs en un entorno con browser runner.)
- [ ] Manual: como estudiante con un trabajo que ya tiene orientador y está activo → "Solicitar coorientador" lista profesores+externos (sin el orientador), permite elegir y enviar; como profesor/externo invitado → la solicitud aparece en "Solicitudes de coorientación" y se puede aceptar/rechazar; al aceptar, el coorientador aparece en el detalle y al publicar en el repositorio.

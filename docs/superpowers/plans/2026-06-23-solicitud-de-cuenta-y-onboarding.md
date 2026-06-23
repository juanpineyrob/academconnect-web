# Solicitud de cuenta y onboarding — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el auto-registro abierto por un onboarding cuya única ancla de identidad es el control del correo institucional: tres vías (self-request, bulk import, alta manual) convergen en una credencial que el usuario siempre establece vía token enviado al email.

**Architecture:** El backend (Spring Boot 4.0.6 / Java 25 / Postgres 16) gana una máquina de estados de cuenta `INVITADA → ACTIVA` ortogonal al `activo` existente, una primitiva única de token (activación = reset) guardada solo como hash, una cola de mail (`mail_pendiente` + drainer `@Scheduled` para envío en oleadas), y endpoints públicos anti-enumeración + endpoints admin de solicitudes e importación. El frontend (Angular 21, standalone, signals, OnPush) suma páginas públicas de solicitud y de establecer contraseña, y páginas admin de cola de solicitudes e importación masiva, reusando los patrones de `usuarios-page` e `importar-trabajo-page`.

**Tech Stack:** Spring Boot 4.0.6, Java 25, Postgres 16, Flyway, JPA/Hibernate (herencia JOINED), Spring Security (JWT cookie `ac_jwt`, `@EnableMethodSecurity`), JavaMailSender (a incorporar), Apache Commons CSV (a incorporar), Testcontainers + JUnit5 + MockMvc; Angular 21, Vitest 4, reactive forms.

---

## Restricciones de proceso (OBLIGATORIO al commitear)

- **Commits SIN trailer `Co-Authored-By`** (ambos repos). Ver [[feedback_no_coauthored_by]].
- **Nunca `git add -A`**; siempre rutas explícitas.
- **No tocar/commitear** archivos del compañero (untracked): `academconnect/src/main/java/com/academconnect/controller/AdminTrabajoController.java`, `.../dto/TrabajoAdminImportRequest.java`, ni el doc `docs/superpowers/plans/2026-06-10-perfil-publico-cards-y-correcciones.md`.
- Commits en `main`. Backend en `../academconnect` (los paths backend de este plan son relativos a ese repo).
- Verificar con tests/build antes de afirmar que algo funciona; preferir **tests de integración que ejecuten queries reales** (Testcontainers), no mocks de repos.
- Comandos: backend `./mvnw test` (en `../academconnect`); frontend `npm run test`, `npm run build`, `npm run lint`.

---

## Decisiones de diseño (resolución de las preguntas abiertas)

### Q1 — Modelo de datos y estado de cuenta

**`estadoCuenta` es un campo nuevo, ortogonal a `activo`.** No se combinan:

- `estado_cuenta VARCHAR(20)` enum `INVITADA | ACTIVA` → ciclo de vida de la **credencial** (¿el usuario ya probó control del email y fijó contraseña?).
- `activo BOOLEAN` (ya existe) → **suspensión administrativa** (el admin habilita/inhabilita). Semántica intacta.
- **Regla de login:** se permite solo si `estado_cuenta = ACTIVA AND activo = true`. Una cuenta `INVITADA` no tiene contraseña utilizable y nunca pasa el login.

**`password` pasa a ser nullable.** Las cuentas `INVITADA` no tienen contraseña (nunca se setea por admin ni se importa). Invariante de aplicación: `password IS NOT NULL ⇔ estado_cuenta = ACTIVA`. El login chequea `estado_cuenta` **antes** de `passwordEncoder.matches(...)` para no romper con `password = null`.

**Entidades nuevas** (todas extienden `BaseEntity` que ya aporta `id, created_at, updated_at, created_by, updated_by`):

| Entidad | Tabla | Campos clave |
|---|---|---|
| `SolicitudCuenta` | `solicitud_cuenta` | `matricula`, `email`, `nombre`, `estado` (`PENDIENTE/APROBADA/RECHAZADA`), `motivo_rechazo` (nullable), `decidido_por_id` (nullable FK usuario), `decidido_en` (nullable) |
| `TokenCuenta` | `token_cuenta` | `usuario_id` (FK), `token_hash` (UNIQUE, SHA-256 hex), `proposito` (`ACTIVACION/RESET`), `expira_en`, `usado_en` (nullable) |
| `LoteImportacion` | `lote_importacion` | `archivo_hash` (sha-256 del archivo), `nombre_archivo`, `estado` (`PREVIEW/CONFIRMADO`), `total`, `nuevos`, `existentes`, `errores`, `creado_por_id` (FK) |
| `LoteImportacionItem` | `lote_importacion_item` | `lote_id` (FK), `linea` (int), `matricula`, `email`, `nombre`, `resultado` (`NUEVO/EXISTE_ACTIVA/EXISTE_INVITADA/COLISION_EMAIL/COLISION_MATRICULA/ERROR_FORMATO`), `detalle` (nullable) |
| `MailPendiente` | `mail_pendiente` | `destinatario`, `asunto`, `cuerpo_html`, `cuerpo_texto`, `estado` (`PENDIENTE/ENVIADO/FALLIDO`), `intentos`, `ultimo_error` (nullable), `enviado_en` (nullable) |

**Vínculo cuenta↔lote:** columna nullable `usuario.lote_importacion_id` (FK a `lote_importacion`). Es la unión consultable que pide el brief ("vincular cuentas al batch") sin tablas de join extra.

**Por qué stateful en import:** el preview persiste un `LoteImportacion` en estado `PREVIEW` (con sus `LoteImportacionItem` ya validados) y devuelve `loteId`; el commit referencia ese `loteId`. Evita re-subir el archivo, da idempotencia, auditoría y permite encolar mails en oleadas. Los lotes `PREVIEW` no confirmados se purgan (24 h).

### Q2 — Endpoints y `@PreAuthorize`

**Públicos** (bajo `/auth/**`, ya `permitAll` para POST en `SecurityConfig`):

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/auth/solicitudes` | `{matricula, email, nombre, motivo?}` | `202` genérico siempre |
| POST | `/auth/password/establecer` | `{token, password}` | `204` ok / `400` genérico si token inválido |
| POST | `/auth/password/recuperar` | `{email}` | `202` genérico siempre |
| POST | `/auth/activacion/reenviar` | `{email}` | `202` genérico siempre |
| POST | `/auth/token/verificar` | `{token}` | `200 {valido:bool, proposito?}` (no enumera: válido=token existe, no usado, no expirado) |

**Admin solicitudes** (`/admin/solicitudes`, `@PreAuthorize("hasRole('ADMINISTRADOR')")` a nivel clase):

| Método | Ruta | Cuerpo |
|---|---|---|
| GET | `/admin/solicitudes?estado=&q=&page=&size=` | — (paginado, `Page<SolicitudResponse>`) |
| POST | `/admin/solicitudes/{id}/aprobar` | — → crea cuenta `INVITADA` ESTUDIANTE + token ACTIVACION + encola mail |
| POST | `/admin/solicitudes/{id}/rechazar` | `{motivo}` |

**Admin importación** (`/admin/importaciones`, `@PreAuthorize("hasRole('ADMINISTRADOR')")`):

| Método | Ruta | Cuerpo |
|---|---|---|
| POST | `/admin/importaciones/preview` | multipart `file` → crea lote PREVIEW, devuelve reporte |
| GET | `/admin/importaciones/{id}` | — (reporte del lote) |
| POST | `/admin/importaciones/{id}/confirmar` | `{reenviarInvitadas:bool}` → crea cuentas + encola mails en oleadas |

**Admin usuarios** (modificaciones a `AdminUsuarioController` existente):

- `POST /admin/usuarios` → **ya no recibe `password`**; crea `INVITADA` + token ACTIVACION + encola mail.
- `POST /admin/usuarios/{id}/reset-password` (con body) → **se elimina** y se reemplaza por `POST /admin/usuarios/{id}/enviar-enlace-password` (sin body) → emite token (`RESET` si ACTIVA, `ACTIVACION` si INVITADA) + encola mail.

### Q3 — Casos de error, respuestas genéricas y rate-limit

- **Anti-enumeración:** `/auth/solicitudes`, `/auth/password/recuperar`, `/auth/activacion/reenviar` responden **siempre** `202` con cuerpo `{mensaje: "Si corresponde, enviaremos un enlace al correo indicado."}`. Nunca revelan si email/matrícula existe o en qué estado está.
- **`/auth/password/establecer`:** token inválido/expirado/usado → `400` genérico `urn:academconnect:error:token-invalido` ("El enlace es inválido o expiró. Solicitá uno nuevo."). Password débil → `400` con `errors` por campo (revelar reglas de password es aceptable).
- **`/auth/token/verificar`:** `200 {valido:false}` para token inexistente/expirado/usado (sin distinguir el motivo).
- **Bulk colisiones = error duro**, sin merge: email usado por otra matrícula → `COLISION_EMAIL`; matrícula con email distinto → `COLISION_MATRICULA`. Aparecen en el reporte; el commit las saltea (no crea ni pisa).
- **Rate-limit** (`RateLimiterService` nuevo, in-memory sliding window por clave; single-instance, documentado como tal): `solicitudes` 5/h por IP; `recuperar` y `reenviar` 5/h por (email+IP); `establecer` 10/h por IP; `verificar` 30/h por IP. Excedido → `429` genérico `urn:academconnect:error:rate-limit`.
- Errores admin: solicitud inexistente → `404`; aprobar cuando matrícula/email ya tiene cuenta → `409 urn:academconnect:error:conflicto-identidad` (visible al admin, no es endpoint público).

### Q4 — Unificación activación/reset

Una sola primitiva **"probar control del email → setear contraseña"**:

- Un solo modelo `TokenCuenta` con `proposito ∈ {ACTIVACION, RESET}`, hash de un solo uso, ligado a `(usuario, proposito)`, TTL 48 h (`academconnect.onboarding.token-ttl-horas=48`, rango 24–72).
- Un solo endpoint de consumo `POST /auth/password/establecer`. Diferencia única: si el token es `ACTIVACION`, además setea `estado_cuenta = ACTIVA`; si es `RESET`, la cuenta ya estaba `ACTIVA`.
- **Emitir un token nuevo invalida el anterior** del mismo `(usuario, proposito)`: al emitir se borran los tokens previos no usados de ese par.
- Reenviable vía `/auth/activacion/reenviar` (ACTIVACION) y `/auth/password/recuperar` (RESET). Ambos generan token nuevo (invalidando el previo) y encolan mail.
- **Las cuentas no caducan** (la `INVITADA` vive indefinidamente reteniendo la matrícula → anti-squatting). **Solo el token caduca.**

### Q5 — Plantillas de email y envío en oleadas

- **Sin Thymeleaf** (no es dependencia): `MailTemplateService` arma `asunto + cuerpoHtml + cuerpoTexto` por sustitución simple de placeholders sobre plantillas en `src/main/resources/mail/`. Totalmente testeable.
- Dos plantillas: `activacion` y `restablecer`. Enlace → `${academconnect.frontend.base-url}/establecer-password?token=<token-en-claro>`. El token en claro existe **solo** en memoria al emitir (se guarda únicamente el hash).
- **Cola/oleadas:** `MailPendiente` (outbox) + drainer `@Scheduled(fixedDelayString=...)` que toma hasta `lote-size` pendientes por tick (default 25 cada 30 s), reintenta hasta 3 veces con backoff por intentos, marca `ENVIADO/FALLIDO`. Bulk import encola N filas en `PENDIENTE`; el drainer las drena en oleadas (deliverability + no parecer phishing masivo). Idempotente: encolar es insertar; reenviar genera nueva fila.

### Q6 — Retiro de endpoints legacy `/auth/register/*`

1. **Frontend ya** tiene el link "Solicitar cuenta" deshabilitado → se habilita apuntando a `/solicitar-cuenta` (Phase 7). No hay componente de auto-registro que borrar.
2. **Backend:** se eliminan los 3 métodos `registerEstudiante/Profesor/Externo` de `AuthController` y los 3 de `AuthService`. Se actualizan/eliminan los tests de `AuthControllerTests` que ejercen register.
3. `EstudianteRequest/ProfesorRequest/ExternoRequest` siguen usados por `*Service.crear(...)` (lo usa el seed de tests y, indirectamente, admin) → **no se borran**; solo se desconecta el endpoint público. Se verifica con `grep` antes de borrar nada (Task de retiro lo hace explícito).
4. `POST /auth/**` permanece `permitAll` (los endpoints nuevos viven ahí).

### Q7 — Migración

Migraciones Flyway nuevas, partiendo de **V19** como la más alta actual. **Numeradas por orden de creación/despliegue** (= orden de fases) para que cada commit solo agregue el siguiente número y Flyway no falle por out-of-order en despliegues incrementales:

- **V20** `estado_cuenta_y_password_nullable` (Phase 1): agrega `usuario.estado_cuenta`, backfill existentes a `ACTIVA`, `ALTER COLUMN password DROP NOT NULL`.
- **V21** `token_cuenta` (Phase 1).
- **V22** `mail_pendiente` (Phase 2).
- **V23** `solicitud_cuenta` (Phase 3).
- **V24** `lote_importacion` + `lote_importacion_item` + `usuario.lote_importacion_id` (Phase 5).

Backfill V20 garantiza que todos los usuarios actuales (que tienen password) queden `ACTIVA` → login intacto. `ddl-auto=validate` en test exige que el mapeo JPA coincida exactamente con las migraciones.

### Q8 — Integración con el feed de actividad

Nuevos `TipoActividad` (agregar constantes al enum; el resto del feed es genérico):

`SOLICITUD_CUENTA_ENVIADA`, `SOLICITUD_CUENTA_APROBADA`, `SOLICITUD_CUENTA_RECHAZADA`, `CUENTA_INVITADA_CREADA`, `CUENTA_ACTIVADA`, `ENLACE_PASSWORD_ENVIADO`, `PASSWORD_RESTABLECIDA`, `IMPORTACION_CONFIRMADA`.

- `visibilidad = PRIVADA` (auditoría admin; no aparece en feeds públicos/participantes).
- `actorId` = admin que decide / `null` en self-request (aún no hay usuario) / `null` (sistema) en activación por token.
- `recursoTipo` ∈ `"SOLICITUD_CUENTA" | "USUARIO" | "LOTE_IMPORTACION"`; `recursoId` el id correspondiente.
- **Payload sin PII sensible:** se incluye `matricula` (identificador público) y conteos; **no** se incluye `email` ni `nombre`. Esto sostiene la retención: al purgar `SolicitudCuenta` la auditoría persiste en `actividad` sin reexponer PII.

### Retención de PII (regla del brief)

Job `@Scheduled` diario `PurgaSolicitudesJob`: borra `SolicitudCuenta` con `estado IN (PENDIENTE, RECHAZADA)` y `updated_at < now - 7 días`; y `LoteImportacion` en `PREVIEW` con `created_at < now - 24 h` (con sus items, `ON DELETE CASCADE`). El metadato de rechazo/decisión ya vive en `actividad` (sin PII), cumpliendo "se conserva metadato del rechazo para auditoría".

---

## Modelo de amenaza (recordatorio operativo)

La activación siempre va al **email institucional** del dueño → un impostor con la matrícula ajena no puede activar sin la casilla de la víctima. Self-request: la diligencia del admin (verificar email↔matrícula contra SUAP, fuera de scope técnico) backstopea. Bulk: el padrón es autoritativo. Residual aceptado: diligencia del admin y correo institucional comprometido (problema de la institución).

---

## Estructura de archivos

### Backend (`../academconnect`, paquete base `com.academconnect`)

**Crear:**
- `domain/EstadoCuenta.java`, `domain/SolicitudCuenta.java`, `domain/EstadoSolicitud.java`, `domain/TokenCuenta.java`, `domain/PropositoToken.java`, `domain/LoteImportacion.java`, `domain/EstadoLote.java`, `domain/LoteImportacionItem.java`, `domain/ResultadoFila.java`, `domain/MailPendiente.java`, `domain/EstadoMail.java`
- `repository/SolicitudCuentaRepository.java`, `repository/TokenCuentaRepository.java`, `repository/LoteImportacionRepository.java`, `repository/MailPendienteRepository.java`
- `service/TokenCuentaService.java` (primitiva token: emitir/consumir/hash), `service/OnboardingService.java` (solicitudes, establecer-password, recuperar, reenviar), `service/ImportacionUsuariosService.java`, `service/MailService.java` (encolar + enviar), `service/MailTemplateService.java`, `service/RateLimiterService.java`, `service/PurgaSolicitudesJob.java`
- `controller/OnboardingController.java` (público `/auth/...`), `controller/AdminSolicitudController.java`, `controller/AdminImportacionController.java`
- DTOs en `dto/`: `SolicitudCuentaRequest`, `EstablecerPasswordRequest`, `EmailRequest`, `VerificarTokenRequest`, `VerificarTokenResponse`, `SolicitudResponse`, `RechazoRequest`, `ImportPreviewResponse`, `ImportItemResponse`, `ImportConfirmRequest`
- `config/MailConfig.java` (si hace falta), `config/SchedulingConfig.java` (`@EnableScheduling`)
- `mail/activacion.html`, `mail/activacion.txt`, `mail/restablecer.html`, `mail/restablecer.txt` (en `src/main/resources/mail/`)
- Migraciones `db/migration/V20__...sql` … `V24__...sql`

**Modificar:**
- `domain/Usuario.java` (campos `estadoCuenta`, `loteImportacion`/`loteImportacionId`; `password` nullable)
- `service/AuthService.java` (login chequea `estadoCuenta`; quita métodos register)
- `controller/AuthController.java` (quita endpoints register)
- `service/AdminUsuarioService.java` (crear → INVITADA + token; reemplaza resetPassword por enviarEnlace)
- `controller/AdminUsuarioController.java` (idem)
- `dto/AdminUsuarioCreateRequest.java` (quita `password`)
- `pom.xml` (agrega `spring-boot-starter-mail`, `commons-csv`, `greenmail` test)
- `domain/TipoActividad.java` (nuevas constantes)

### Frontend (`academconnect-web`)

**Crear:**
- `src/app/features/auth/solicitar-cuenta-page/` (ts + html + scss)
- `src/app/features/auth/establecer-password-page/` (ts + html + scss)
- `src/app/features/auth/recuperar-password-page/` (ts + html + scss)
- `src/app/features/admin/solicitudes-page/` (ts + html + scss)
- `src/app/features/admin/importar-usuarios-page/` (ts + html + scss)
- modelos en `src/app/features/auth/onboarding.models.ts` y `src/app/features/admin/admin.models.ts` (extender)

**Modificar:**
- `src/app/features/auth/auth.routes.ts` (rutas públicas nuevas)
- `src/app/features/admin/admin.routes.ts` (rutas admin nuevas)
- `src/app/features/auth/auth.service.ts` (métodos onboarding) o un `OnboardingService` nuevo
- `src/app/features/admin/admin.service.ts` (solicitudes + importación)
- `src/app/features/auth/login-page/login-page.html` (habilitar link "Solicitar cuenta")

---

## Fases (cada fase es software funcional y verificable por sí mismo)

- **Phase 0** — Dependencias + scaffolding (mail, csv, scheduling).
- **Phase 1** — Estado de cuenta + primitiva token + establecer-password + guard de login + migración V20–V22.
- **Phase 2** — Cola de mail (outbox) + envío en oleadas + plantillas + V24.
- **Phase 3** — Self-request + cola admin de solicitudes.
- **Phase 4** — Alta manual admin → INVITADA + reemplazo de reset-password admin.
- **Phase 5** — Bulk import preview/commit + V23.
- **Phase 6** — Retiro de endpoints legacy `/auth/register/*`.
- **Phase 7** — Frontend (páginas públicas + admin + link login).
- **Phase 8** — Job de purga de PII + eventos de actividad.

> Mantener el orden: Phase 1 es prerequisito de 3/4/5; Phase 2 de 3/4/5; Phase 7 consume todo lo anterior. Cada tarea es un paso de 2–5 min. Los comandos backend asumen `cwd = ../academconnect`.

---

## Phase 0 — Dependencias y scaffolding

### Task 0.1: Agregar dependencias de mail y CSV

**Files:**
- Modify: `pom.xml`

- [ ] **Step 1: Agregar dependencias**

En `<dependencies>` agregar:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-mail</artifactId>
</dependency>
<dependency>
    <groupId>org.apache.commons</groupId>
    <artifactId>commons-csv</artifactId>
    <version>1.12.0</version>
</dependency>
<dependency>
    <groupId>com.icegreen</groupId>
    <artifactId>greenmail-junit5</artifactId>
    <version>2.1.2</version>
    <scope>test</scope>
</dependency>
```

- [ ] **Step 2: Verificar que resuelve**

Run: `./mvnw -q dependency:resolve`
Expected: BUILD SUCCESS, sin errores de descarga.

- [ ] **Step 3: Commit**

```bash
git add pom.xml
git commit -m "build: agregar starter-mail, commons-csv y greenmail (test) para onboarding"
```

### Task 0.2: Habilitar scheduling y configuración de onboarding

**Files:**
- Create: `src/main/java/com/academconnect/config/SchedulingConfig.java`
- Modify: `src/main/resources/application.properties`
- Modify: `src/main/resources/application-test.properties`

- [ ] **Step 1: Crear SchedulingConfig**

```java
package com.academconnect.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class SchedulingConfig {
}
```

- [ ] **Step 2: Agregar propiedades a application.properties**

```properties
# Onboarding
academconnect.onboarding.token-ttl-horas=48
academconnect.frontend.base-url=http://localhost:4200
# Mail (SMTP real configurable por entorno; en dev usar Mailpit/maildev en localhost:1025)
spring.mail.host=${MAIL_HOST:localhost}
spring.mail.port=${MAIL_PORT:1025}
spring.mail.username=${MAIL_USERNAME:}
spring.mail.password=${MAIL_PASSWORD:}
spring.mail.properties.mail.smtp.auth=${MAIL_SMTP_AUTH:false}
spring.mail.properties.mail.smtp.starttls.enable=${MAIL_SMTP_STARTTLS:false}
academconnect.mail.from=no-reply@academconnect.local
academconnect.mail.lote-size=25
academconnect.mail.drain-fixed-delay-ms=30000
```

- [ ] **Step 3: Desactivar el drainer automático en tests**

En `application-test.properties` agregar (drenamos manualmente en los tests para determinismo):

```properties
academconnect.mail.drain-fixed-delay-ms=3600000
academconnect.onboarding.token-ttl-horas=48
academconnect.frontend.base-url=http://localhost:4200
spring.mail.host=localhost
spring.mail.port=3025
academconnect.mail.from=no-reply@test.local
```

- [ ] **Step 4: Verificar arranque del contexto**

Run: `./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: PASS (el contexto levanta con scheduling habilitado).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/academconnect/config/SchedulingConfig.java src/main/resources/application.properties src/main/resources/application-test.properties
git commit -m "config: habilitar scheduling y propiedades de onboarding/mail"
```

---

## Phase 1 — Estado de cuenta + primitiva token + establecer-password

### Task 1.1: Migración V20 — estado_cuenta y password nullable

**Files:**
- Create: `src/main/resources/db/migration/V20__estado_cuenta_y_password_nullable.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Ciclo de vida de la credencial, ortogonal a `activo` (suspensión admin).
-- INVITADA: cuenta creada, sin contraseña, espera activación por token al email.
-- ACTIVA: el usuario probó control del email y fijó contraseña.
ALTER TABLE usuario ADD COLUMN estado_cuenta VARCHAR(20) NOT NULL DEFAULT 'ACTIVA';

-- Backfill: los usuarios existentes ya tienen contraseña -> ACTIVA (login intacto).
UPDATE usuario SET estado_cuenta = 'ACTIVA';

-- Las cuentas INVITADA no tienen contraseña (nunca seteada por admin ni importada).
ALTER TABLE usuario ALTER COLUMN password DROP NOT NULL;

ALTER TABLE usuario ADD CONSTRAINT chk_usuario_estado_cuenta
    CHECK (estado_cuenta IN ('INVITADA', 'ACTIVA'));

-- Invariante: contraseña presente si y solo si la cuenta está ACTIVA.
ALTER TABLE usuario ADD CONSTRAINT chk_usuario_password_estado
    CHECK ((estado_cuenta = 'ACTIVA' AND password IS NOT NULL)
        OR (estado_cuenta = 'INVITADA' AND password IS NULL));

CREATE INDEX idx_usuario_estado_cuenta ON usuario(estado_cuenta);
```

- [ ] **Step 2: Verificar que Flyway aplica la migración**

Run: `./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: PASS (Flyway aplica V20 sobre el contenedor; `ddl-auto=validate` aún no chequea la columna nueva porque no hay mapeo JPA todavía — eso lo agrega Task 1.2).

- [ ] **Step 3: Commit**

```bash
git add src/main/resources/db/migration/V20__estado_cuenta_y_password_nullable.sql
git commit -m "feat(db): V20 estado_cuenta + password nullable en usuario"
```

### Task 1.2: Enum EstadoCuenta y mapeo en Usuario

**Files:**
- Create: `src/main/java/com/academconnect/domain/EstadoCuenta.java`
- Modify: `src/main/java/com/academconnect/domain/Usuario.java`

- [ ] **Step 1: Crear el enum**

```java
package com.academconnect.domain;

public enum EstadoCuenta {
    INVITADA,
    ACTIVA
}
```

- [ ] **Step 2: Mapear en Usuario**

En `Usuario.java`, agregar el campo (y hacer `password` opcional — ya es String, solo se vuelve nullable en DB):

```java
@Enumerated(EnumType.STRING)
@Column(name = "estado_cuenta", nullable = false, length = 20)
private EstadoCuenta estadoCuenta = EstadoCuenta.ACTIVA;
```

Asegurar getter/setter (Lombok `@Getter/@Setter` a nivel clase ya los genera; si no, agregarlos).

- [ ] **Step 3: Verificar que el mapeo valida contra la migración**

Run: `./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: PASS (`ddl-auto=validate` confirma que `estado_cuenta` coincide).

- [ ] **Step 4: Commit**

```bash
git add src/main/java/com/academconnect/domain/EstadoCuenta.java src/main/java/com/academconnect/domain/Usuario.java
git commit -m "feat(domain): EstadoCuenta mapeado en Usuario"
```

### Task 1.3: Login rechaza cuentas no ACTIVAS (test primero)

**Files:**
- Modify: `src/main/java/com/academconnect/service/AuthService.java`
- Test: `src/test/java/com/academconnect/controller/AuthControllerTests.java`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `AuthControllerTests` (usa el patrón existente: `@SpringBootTest`, `MockMvc`, seed vía `estudianteService.crear`). Crear un estudiante y forzarlo a `INVITADA` con password null por repositorio:

```java
@Autowired private UsuarioRepository usuarioRepository;

@Test
void loginShouldFailGenericallyWhenAccountIsInvitada() throws Exception {
    var u = usuarioRepository.findByEmail("seed@academ.test").orElseThrow();
    u.setEstadoCuenta(EstadoCuenta.INVITADA);
    u.setPassword(null);
    usuarioRepository.save(u);

    mockMvc.perform(post("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"seed@academ.test\",\"password\":\"cualquier-cosa\"}"))
        .andExpect(status().isUnauthorized());
}
```

(Ajustar el email/seed al que ya use `seedUsuario()` en la clase.)

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `./mvnw -q test -Dtest=AuthControllerTests#loginShouldFailGenericallyWhenAccountIsInvitada`
Expected: FAIL — hoy `login` haría `passwordEncoder.matches(raw, null)` → NPE/500, no 401.

- [ ] **Step 3: Implementar el guard**

En `AuthService.login(...)`, **antes** de `passwordEncoder.matches(...)`:

```java
public AuthResponse login(LoginRequest request) {
    var usuario = usuarioRepository.findByEmail(request.email())
            .orElseThrow(() -> new BadCredentialsException("Credenciales inválidas"));
    if (usuario.getEstadoCuenta() != EstadoCuenta.ACTIVA || usuario.getPassword() == null) {
        throw new BadCredentialsException("Credenciales inválidas");
    }
    if (!passwordEncoder.matches(request.password(), usuario.getPassword())) {
        throw new BadCredentialsException("Credenciales inválidas");
    }
    if (!usuario.isActivo()) {
        throw new BusinessException("Cuenta desactivada. Contacte al administrador.");
    }
    return buildResponse(usuario);
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `./mvnw -q test -Dtest=AuthControllerTests`
Expected: PASS (incluye el nuevo y los preexistentes de login).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/academconnect/service/AuthService.java src/test/java/com/academconnect/controller/AuthControllerTests.java
git commit -m "feat(auth): login rechaza cuentas no ACTIVAS de forma genérica"
```

### Task 1.4: Migración V21 — token_cuenta  ✅ (ejecutada inline)

**Files:**
- Create: `src/main/resources/db/migration/V21__token_cuenta.sql`

> Numerada V21 (no V22) para mantener contigüidad por orden de creación: token (Phase 1) se despliega antes que mail/solicitud/lote.

- [ ] **Step 1: Escribir la migración**

```sql
-- Primitiva única "probar control del email -> setear contraseña".
-- Sirve para ACTIVACION (cuenta INVITADA) y RESET (cuenta ACTIVA).
CREATE TABLE token_cuenta (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,           -- SHA-256 hex del token en claro
    proposito VARCHAR(20) NOT NULL,
    expira_en TIMESTAMP WITH TIME ZONE NOT NULL,
    usado_en TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    updated_by VARCHAR(100) NOT NULL,
    CONSTRAINT uq_token_cuenta_hash UNIQUE (token_hash),
    CONSTRAINT chk_token_proposito CHECK (proposito IN ('ACTIVACION', 'RESET'))
);

CREATE INDEX idx_token_cuenta_usuario ON token_cuenta(usuario_id, proposito);
```

- [ ] **Step 2: Verificar Flyway**

Run: `./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/resources/db/migration/V21__token_cuenta.sql
git commit -m "feat(db): V21 token_cuenta (primitiva activación/reset)"
```

### Task 1.5: Entidad TokenCuenta + repositorio

**Files:**
- Create: `src/main/java/com/academconnect/domain/PropositoToken.java`
- Create: `src/main/java/com/academconnect/domain/TokenCuenta.java`
- Create: `src/main/java/com/academconnect/repository/TokenCuentaRepository.java`

- [ ] **Step 1: Enum**

```java
package com.academconnect.domain;

public enum PropositoToken {
    ACTIVACION,
    RESET
}
```

- [ ] **Step 2: Entidad**

```java
package com.academconnect.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.OffsetDateTime;

@Entity
@Table(name = "token_cuenta")
@Getter
@Setter
public class TokenCuenta extends BaseEntity {

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PropositoToken proposito;

    @Column(name = "expira_en", nullable = false)
    private OffsetDateTime expiraEn;

    @Column(name = "usado_en")
    private OffsetDateTime usadoEn;

    public boolean esUsable(OffsetDateTime ahora) {
        return usadoEn == null && expiraEn.isAfter(ahora);
    }
}
```

(Verificar el tipo de timestamp que usa `BaseEntity`/otras entidades — si usan `Instant`, usar `Instant` aquí también para consistencia. Confirmar con `BaseEntity.java` antes de elegir.)

- [ ] **Step 3: Repositorio**

```java
package com.academconnect.repository;

import com.academconnect.domain.PropositoToken;
import com.academconnect.domain.TokenCuenta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface TokenCuentaRepository extends JpaRepository<TokenCuenta, Long> {

    Optional<TokenCuenta> findByTokenHash(String tokenHash);

    @Modifying
    @Query("DELETE FROM TokenCuenta t WHERE t.usuarioId = :usuarioId AND t.proposito = :proposito AND t.usadoEn IS NULL")
    void deleteNoUsadosPorUsuarioYProposito(@Param("usuarioId") Long usuarioId,
                                            @Param("proposito") PropositoToken proposito);
}
```

- [ ] **Step 4: Verificar mapeo**

Run: `./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: PASS (`validate` confirma `token_cuenta`).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/academconnect/domain/PropositoToken.java src/main/java/com/academconnect/domain/TokenCuenta.java src/main/java/com/academconnect/repository/TokenCuentaRepository.java
git commit -m "feat(domain): TokenCuenta + repositorio"
```

### Task 1.6: TokenCuentaService — emitir y consumir (test de integración)

**Files:**
- Create: `src/main/java/com/academconnect/service/TokenCuentaService.java`
- Test: `src/test/java/com/academconnect/service/TokenCuentaServiceTests.java`

- [ ] **Step 1: Escribir el test de integración (queries reales)**

```java
package com.academconnect.service;

import com.academconnect.TestcontainersConfiguration;
import com.academconnect.domain.*;
import com.academconnect.repository.TokenCuentaRepository;
import com.academconnect.repository.UsuarioRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class TokenCuentaServiceTests {

    @Autowired private TokenCuentaService tokenService;
    @Autowired private TokenCuentaRepository tokenRepository;
    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private EstudianteService estudianteService;

    private Long crearInvitada() {
        var resp = estudianteService.crear(new com.academconnect.dto.EstudianteRequest(
                "tok@academ.test", "Password123", "Tok", null, null, null));
        var u = usuarioRepository.findById(resp.id()).orElseThrow();
        u.setEstadoCuenta(EstadoCuenta.INVITADA);
        u.setPassword(null);
        usuarioRepository.save(u);
        return u.getId();
    }

    @Test
    void emitirGuardaSoloHashYDevuelveTokenEnClaro() {
        Long id = crearInvitada();
        String claro = tokenService.emitir(id, PropositoToken.ACTIVACION);

        assertThat(claro).isNotBlank().hasSizeGreaterThanOrEqualTo(32);
        var guardado = tokenRepository.findAll().get(0);
        assertThat(guardado.getTokenHash()).isNotEqualTo(claro);   // se guarda hash, no claro
        assertThat(guardado.getTokenHash()).hasSize(64);           // sha-256 hex
    }

    @Test
    void emitirInvalidaTokenPrevioDelMismoProposito() {
        Long id = crearInvitada();
        tokenService.emitir(id, PropositoToken.ACTIVACION);
        tokenService.emitir(id, PropositoToken.ACTIVACION);

        assertThat(tokenRepository.findAll()).hasSize(1);
    }

    @Test
    void consumirDevuelveUsuarioYMarcaUsadoUnaSolaVez() {
        Long id = crearInvitada();
        String claro = tokenService.emitir(id, PropositoToken.ACTIVACION);

        var consumido = tokenService.consumir(claro, PropositoToken.ACTIVACION);
        assertThat(consumido.getId()).isEqualTo(id);

        // segundo intento falla (un solo uso)
        org.junit.jupiter.api.Assertions.assertThrows(RuntimeException.class,
                () -> tokenService.consumir(claro, PropositoToken.ACTIVACION));
    }
}
```

- [ ] **Step 2: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=TokenCuentaServiceTests`
Expected: FAIL — `TokenCuentaService` no existe / no compila.

- [ ] **Step 3: Implementar el servicio**

```java
package com.academconnect.service;

import com.academconnect.domain.PropositoToken;
import com.academconnect.domain.TokenCuenta;
import com.academconnect.domain.Usuario;
import com.academconnect.exception.BusinessException;
import com.academconnect.repository.TokenCuentaRepository;
import com.academconnect.repository.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;

@Service
@RequiredArgsConstructor
public class TokenCuentaService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final TokenCuentaRepository tokenRepository;
    private final UsuarioRepository usuarioRepository;

    @Value("${academconnect.onboarding.token-ttl-horas:48}")
    private long ttlHoras;

    /** Emite un token nuevo (invalidando los previos no usados del mismo propósito). Devuelve el token EN CLARO. */
    @Transactional
    public String emitir(Long usuarioId, PropositoToken proposito) {
        tokenRepository.deleteNoUsadosPorUsuarioYProposito(usuarioId, proposito);

        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String claro = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        TokenCuenta t = new TokenCuenta();
        t.setUsuarioId(usuarioId);
        t.setTokenHash(hash(claro));
        t.setProposito(proposito);
        t.setExpiraEn(OffsetDateTime.now().plusHours(ttlHoras));
        tokenRepository.save(t);
        return claro;
    }

    /** Consume el token (un solo uso). Lanza BusinessException si es inválido/expirado/usado o de otro propósito. */
    @Transactional
    public Usuario consumir(String claro, PropositoToken propositoEsperado) {
        var token = tokenRepository.findByTokenHash(hash(claro))
                .filter(t -> t.getProposito() == propositoEsperado)
                .filter(t -> t.esUsable(OffsetDateTime.now()))
                .orElseThrow(() -> new BusinessException("token-invalido"));
        token.setUsadoEn(OffsetDateTime.now());
        tokenRepository.save(token);
        return usuarioRepository.findById(token.getUsuarioId())
                .orElseThrow(() -> new BusinessException("token-invalido"));
    }

    /** Verifica sin consumir. Devuelve el propósito si es usable, o null. */
    @Transactional(readOnly = true)
    public PropositoToken propositoSiUsable(String claro) {
        return tokenRepository.findByTokenHash(hash(claro))
                .filter(t -> t.esUsable(OffsetDateTime.now()))
                .map(TokenCuenta::getProposito)
                .orElse(null);
    }

    private String hash(String claro) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(claro.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
```

(Confirmar la clase de excepción de negocio: el report mostró `BusinessException` en `AuthService`; usar la del paquete real, p. ej. `com.academconnect.exception.BusinessException`.)

- [ ] **Step 4: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=TokenCuentaServiceTests`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/academconnect/service/TokenCuentaService.java src/test/java/com/academconnect/service/TokenCuentaServiceTests.java
git commit -m "feat(onboarding): TokenCuentaService emitir/consumir/verificar con hash y un solo uso"
```

### Task 1.7: Endpoint POST /auth/password/establecer (test MockMvc primero)

**Files:**
- Create: `src/main/java/com/academconnect/dto/EstablecerPasswordRequest.java`
- Create: `src/main/java/com/academconnect/service/OnboardingService.java` (parcial: solo `establecerPassword`)
- Create: `src/main/java/com/academconnect/controller/OnboardingController.java` (parcial)
- Test: `src/test/java/com/academconnect/controller/OnboardingControllerTests.java`

- [ ] **Step 1: DTO**

```java
package com.academconnect.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EstablecerPasswordRequest(
        @NotBlank String token,
        @NotBlank @Size(min = 8, max = 255) String password) {
}
```

- [ ] **Step 2: Test que falla**

```java
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class OnboardingControllerTests {

    @Autowired MockMvc mockMvc;
    @Autowired TokenCuentaService tokenService;
    @Autowired UsuarioRepository usuarioRepository;
    @Autowired EstudianteService estudianteService;

    @Test
    void establecerPasswordActivaLaCuentaYPermiteLogin() throws Exception {
        var resp = estudianteService.crear(new EstudianteRequest("act@academ.test","x".repeat(8),"Act",null,null,null));
        var u = usuarioRepository.findById(resp.id()).orElseThrow();
        u.setEstadoCuenta(EstadoCuenta.INVITADA); u.setPassword(null);
        usuarioRepository.save(u);
        String token = tokenService.emitir(u.getId(), PropositoToken.ACTIVACION);

        mockMvc.perform(post("/auth/password/establecer").contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\",\"password\":\"NuevaPass123\"}"))
            .andExpect(status().isNoContent());

        var actualizado = usuarioRepository.findById(u.getId()).orElseThrow();
        assertThat(actualizado.getEstadoCuenta()).isEqualTo(EstadoCuenta.ACTIVA);
        assertThat(actualizado.getPassword()).isNotNull();

        mockMvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"act@academ.test\",\"password\":\"NuevaPass123\"}"))
            .andExpect(status().isOk());
    }

    @Test
    void establecerPasswordConTokenInvalidoDevuelve400Generico() throws Exception {
        mockMvc.perform(post("/auth/password/establecer").contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"no-existe\",\"password\":\"NuevaPass123\"}"))
            .andExpect(status().isBadRequest());
    }
}
```

- [ ] **Step 3: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=OnboardingControllerTests`
Expected: FAIL — controller/servicio no existen.

- [ ] **Step 4: Implementar servicio (método establecerPassword)**

```java
package com.academconnect.service;

import com.academconnect.domain.EstadoCuenta;
import com.academconnect.domain.PropositoToken;
import com.academconnect.domain.Usuario;
import com.academconnect.repository.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OnboardingService {

    private final TokenCuentaService tokenService;
    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;

    /** Consume el token (ACTIVACION o RESET) y fija la contraseña; activa la cuenta si era ACTIVACION. */
    @Transactional
    public void establecerPassword(String tokenClaro, String passwordPlano) {
        PropositoToken proposito = tokenService.propositoSiUsable(tokenClaro);
        if (proposito == null) {
            throw new com.academconnect.exception.BusinessException("token-invalido");
        }
        Usuario u = tokenService.consumir(tokenClaro, proposito);
        u.setPassword(passwordEncoder.encode(passwordPlano));
        if (proposito == PropositoToken.ACTIVACION) {
            u.setEstadoCuenta(EstadoCuenta.ACTIVA);
        }
        usuarioRepository.save(u);
    }
}
```

- [ ] **Step 5: Implementar controller**

```java
package com.academconnect.controller;

import com.academconnect.dto.EstablecerPasswordRequest;
import com.academconnect.service.OnboardingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class OnboardingController {

    private final OnboardingService onboardingService;

    @PostMapping("/password/establecer")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void establecerPassword(@Valid @RequestBody EstablecerPasswordRequest request) {
        onboardingService.establecerPassword(request.token(), request.password());
    }
}
```

> El `BusinessException("token-invalido")` debe mapear a `400`. Confirmar el `@ControllerAdvice`/`ProblemDetail` existente: si `BusinessException` ya mapea a `400`/`409`, ajustar para que `"token-invalido"` rinda `400` con `type = urn:academconnect:error:token-invalido`. Si el handler existente mapea `BusinessException` a otro status, agregar una excepción específica `TokenInvalidoException extends RuntimeException` y su handler a `400`. **Verificar el handler real antes de elegir.**

- [ ] **Step 6: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=OnboardingControllerTests`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/main/java/com/academconnect/dto/EstablecerPasswordRequest.java src/main/java/com/academconnect/service/OnboardingService.java src/main/java/com/academconnect/controller/OnboardingController.java src/test/java/com/academconnect/controller/OnboardingControllerTests.java
git commit -m "feat(onboarding): POST /auth/password/establecer (activación/reset unificados)"
```

### Task 1.8: Endpoint POST /auth/token/verificar

**Files:**
- Create: `src/main/java/com/academconnect/dto/VerificarTokenRequest.java`, `dto/VerificarTokenResponse.java`
- Modify: `controller/OnboardingController.java`
- Test: extender `OnboardingControllerTests`

- [ ] **Step 1: DTOs**

```java
package com.academconnect.dto;
import jakarta.validation.constraints.NotBlank;
public record VerificarTokenRequest(@NotBlank String token) {}
```
```java
package com.academconnect.dto;
import com.academconnect.domain.PropositoToken;
public record VerificarTokenResponse(boolean valido, PropositoToken proposito) {}
```

- [ ] **Step 2: Test que falla**

```java
@Test
void verificarDevuelveTrueParaTokenUsable() throws Exception {
    var resp = estudianteService.crear(new EstudianteRequest("ver@academ.test","x".repeat(8),"Ver",null,null,null));
    var u = usuarioRepository.findById(resp.id()).orElseThrow();
    String token = tokenService.emitir(u.getId(), PropositoToken.ACTIVACION);
    mockMvc.perform(post("/auth/token/verificar").contentType(MediaType.APPLICATION_JSON)
            .content("{\"token\":\"" + token + "\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.valido").value(true))
        .andExpect(jsonPath("$.proposito").value("ACTIVACION"));
}

@Test
void verificarDevuelveFalseParaTokenInexistenteSinFiltrar() throws Exception {
    mockMvc.perform(post("/auth/token/verificar").contentType(MediaType.APPLICATION_JSON)
            .content("{\"token\":\"no-existe\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.valido").value(false));
}
```

- [ ] **Step 3: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=OnboardingControllerTests`
Expected: FAIL.

- [ ] **Step 4: Implementar endpoint**

```java
@PostMapping("/token/verificar")
public VerificarTokenResponse verificar(@Valid @RequestBody VerificarTokenRequest request) {
    var proposito = tokenService.propositoSiUsable(request.token());
    return new VerificarTokenResponse(proposito != null, proposito);
}
```

(Inyectar `TokenCuentaService tokenService` en el controller.)

- [ ] **Step 5: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=OnboardingControllerTests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/academconnect/dto/VerificarTokenRequest.java src/main/java/com/academconnect/dto/VerificarTokenResponse.java src/main/java/com/academconnect/controller/OnboardingController.java src/test/java/com/academconnect/controller/OnboardingControllerTests.java
git commit -m "feat(onboarding): POST /auth/token/verificar (sin enumeración)"
```

---

## Phase 2 — Cola de mail (outbox) y envío en oleadas

### Task 2.1: Migración V22 — mail_pendiente

**Files:**
- Create: `src/main/resources/db/migration/V22__mail_pendiente.sql`

- [ ] **Step 1: Migración**

```sql
-- Outbox de mail: desacopla "encolar" de "enviar". Permite oleadas (drainer) y reintentos.
CREATE TABLE mail_pendiente (
    id BIGSERIAL PRIMARY KEY,
    destinatario VARCHAR(255) NOT NULL,
    asunto VARCHAR(300) NOT NULL,
    cuerpo_html TEXT NOT NULL,
    cuerpo_texto TEXT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    intentos INT NOT NULL DEFAULT 0,
    ultimo_error VARCHAR(500),
    enviado_en TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    updated_by VARCHAR(100) NOT NULL,
    CONSTRAINT chk_mail_estado CHECK (estado IN ('PENDIENTE','ENVIADO','FALLIDO'))
);

CREATE INDEX idx_mail_pendiente_estado ON mail_pendiente(estado) WHERE estado = 'PENDIENTE';
```

- [ ] **Step 2: Verificar Flyway**

Run: `./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/resources/db/migration/V22__mail_pendiente.sql
git commit -m "feat(db): V22 mail_pendiente (outbox de correo)"
```

### Task 2.2: Entidad MailPendiente + repositorio

**Files:**
- Create: `domain/EstadoMail.java`, `domain/MailPendiente.java`, `repository/MailPendienteRepository.java`

- [ ] **Step 1: Enum + entidad**

```java
package com.academconnect.domain;
public enum EstadoMail { PENDIENTE, ENVIADO, FALLIDO }
```
```java
package com.academconnect.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.OffsetDateTime;

@Entity
@Table(name = "mail_pendiente")
@Getter
@Setter
public class MailPendiente extends BaseEntity {
    @Column(nullable = false, length = 255) private String destinatario;
    @Column(nullable = false, length = 300) private String asunto;
    @Column(name = "cuerpo_html", nullable = false, columnDefinition = "text") private String cuerpoHtml;
    @Column(name = "cuerpo_texto", nullable = false, columnDefinition = "text") private String cuerpoTexto;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private EstadoMail estado = EstadoMail.PENDIENTE;
    @Column(nullable = false) private int intentos = 0;
    @Column(name = "ultimo_error", length = 500) private String ultimoError;
    @Column(name = "enviado_en") private OffsetDateTime enviadoEn;
}
```

- [ ] **Step 2: Repositorio**

```java
package com.academconnect.repository;

import com.academconnect.domain.EstadoMail;
import com.academconnect.domain.MailPendiente;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface MailPendienteRepository extends JpaRepository<MailPendiente, Long> {
    List<MailPendiente> findByEstadoOrderByCreatedAtAsc(EstadoMail estado, Pageable pageable);
}
```

- [ ] **Step 3: Verificar mapeo**

Run: `./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/java/com/academconnect/domain/EstadoMail.java src/main/java/com/academconnect/domain/MailPendiente.java src/main/java/com/academconnect/repository/MailPendienteRepository.java
git commit -m "feat(mail): entidad MailPendiente + repositorio"
```

### Task 2.3: Plantillas de mail + MailTemplateService

**Files:**
- Create: `src/main/resources/mail/activacion.html`, `activacion.txt`, `restablecer.html`, `restablecer.txt`
- Create: `service/MailTemplateService.java`
- Test: `src/test/java/com/academconnect/service/MailTemplateServiceTests.java`

- [ ] **Step 1: Plantillas (placeholders `{{nombre}}`, `{{enlace}}`)**

`mail/activacion.txt`:
```
Hola {{nombre}},

Tu cuenta de AcademConnect fue creada. Para activarla y elegir tu contraseña, entrá a este enlace (vence en {{ttlHoras}} horas):

{{enlace}}

Si no esperabas este correo, ignoralo.
```

`mail/activacion.html`:
```html
<p>Hola {{nombre}},</p>
<p>Tu cuenta de AcademConnect fue creada. Para activarla y elegir tu contraseña, entrá a este enlace (vence en {{ttlHoras}} horas):</p>
<p><a href="{{enlace}}">Activar mi cuenta</a></p>
<p>Si no esperabas este correo, ignoralo.</p>
```

`mail/restablecer.txt`:
```
Hola {{nombre}},

Recibimos un pedido para restablecer tu contraseña de AcademConnect. Entrá a este enlace (vence en {{ttlHoras}} horas):

{{enlace}}

Si no lo pediste, ignorá este correo: tu contraseña no cambió.
```

`mail/restablecer.html`:
```html
<p>Hola {{nombre}},</p>
<p>Recibimos un pedido para restablecer tu contraseña de AcademConnect. Entrá a este enlace (vence en {{ttlHoras}} horas):</p>
<p><a href="{{enlace}}">Restablecer mi contraseña</a></p>
<p>Si no lo pediste, ignorá este correo: tu contraseña no cambió.</p>
```

- [ ] **Step 2: Test que falla**

```java
@SpringBootTest @ActiveProfiles("test") @Import(TestcontainersConfiguration.class)
class MailTemplateServiceTests {
    @Autowired MailTemplateService templates;

    @Test
    void renderActivacionSustituyePlaceholders() {
        var m = templates.activacion("Ana", "abc123");
        assertThat(m.asunto()).isNotBlank();
        assertThat(m.html()).contains("Ana").contains("/establecer-password?token=abc123").doesNotContain("{{");
        assertThat(m.texto()).contains("Ana").contains("/establecer-password?token=abc123").doesNotContain("{{");
    }
}
```

- [ ] **Step 3: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=MailTemplateServiceTests`
Expected: FAIL.

- [ ] **Step 4: Implementar**

```java
package com.academconnect.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Service
public class MailTemplateService {

    public record MailContenido(String asunto, String html, String texto) {}

    @Value("${academconnect.frontend.base-url}") private String frontBase;
    @Value("${academconnect.onboarding.token-ttl-horas:48}") private long ttlHoras;

    public MailContenido activacion(String nombre, String tokenClaro) {
        Map<String, String> vars = vars(nombre, tokenClaro);
        return new MailContenido("Activá tu cuenta de AcademConnect",
                render("mail/activacion.html", vars), render("mail/activacion.txt", vars));
    }

    public MailContenido restablecer(String nombre, String tokenClaro) {
        Map<String, String> vars = vars(nombre, tokenClaro);
        return new MailContenido("Restablecé tu contraseña de AcademConnect",
                render("mail/restablecer.html", vars), render("mail/restablecer.txt", vars));
    }

    private Map<String, String> vars(String nombre, String token) {
        return Map.of(
                "nombre", nombre == null ? "" : nombre,
                "enlace", frontBase + "/establecer-password?token=" + token,
                "ttlHoras", String.valueOf(ttlHoras));
    }

    private String render(String path, Map<String, String> vars) {
        String tpl;
        try {
            tpl = new String(new ClassPathResource(path).getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo leer plantilla " + path, e);
        }
        for (var e : vars.entrySet()) {
            tpl = tpl.replace("{{" + e.getKey() + "}}", e.getValue());
        }
        return tpl;
    }
}
```

- [ ] **Step 5: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=MailTemplateServiceTests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/resources/mail/ src/main/java/com/academconnect/service/MailTemplateService.java src/test/java/com/academconnect/service/MailTemplateServiceTests.java
git commit -m "feat(mail): plantillas activación/restablecer + MailTemplateService"
```

### Task 2.4: MailService — encolar + drenar en oleadas (test con GreenMail)

**Files:**
- Create: `service/MailService.java`
- Test: `src/test/java/com/academconnect/service/MailServiceTests.java`

- [ ] **Step 1: Test que falla (GreenMail SMTP en puerto 3025)**

```java
@SpringBootTest @ActiveProfiles("test") @Import(TestcontainersConfiguration.class)
class MailServiceTests {
    @RegisterExtension static GreenMailExtension green =
        new GreenMailExtension(ServerSetupTest.SMTP.port(3025)).withPerMethodLifecycle(true);

    @Autowired MailService mailService;
    @Autowired MailPendienteRepository repo;

    @Test
    @org.springframework.transaction.annotation.Transactional
    void encolarPersistePendiente() {
        mailService.encolar("a@x.test", "Asunto", "<p>hola</p>", "hola");
        assertThat(repo.findByEstadoOrderByCreatedAtAsc(EstadoMail.PENDIENTE, Pageable.ofSize(10))).hasSize(1);
    }

    @Test
    void drenarEnviaYMarcaEnviado() throws Exception {
        mailService.encolar("dest@x.test", "Asunto", "<p>hola</p>", "hola");
        mailService.drenar();
        green.waitForIncomingEmail(5000, 1);
        assertThat(green.getReceivedMessages()).hasSize(1);
        assertThat(green.getReceivedMessages()[0].getAllRecipients()[0].toString()).isEqualTo("dest@x.test");
    }
}
```

- [ ] **Step 2: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=MailServiceTests`
Expected: FAIL — `MailService` no existe.

- [ ] **Step 3: Implementar**

```java
package com.academconnect.service;

import com.academconnect.domain.EstadoMail;
import com.academconnect.domain.MailPendiente;
import com.academconnect.repository.MailPendienteRepository;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Pageable;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class MailService {

    private static final int MAX_INTENTOS = 3;

    private final MailPendienteRepository repo;
    private final JavaMailSender mailSender;

    @Value("${academconnect.mail.from}") private String from;
    @Value("${academconnect.mail.lote-size:25}") private int loteSize;

    @Transactional
    public void encolar(String destinatario, String asunto, String html, String texto) {
        MailPendiente m = new MailPendiente();
        m.setDestinatario(destinatario);
        m.setAsunto(asunto);
        m.setCuerpoHtml(html);
        m.setCuerpoTexto(texto);
        repo.save(m);
    }

    /** Oleada: toma hasta loteSize pendientes y los envía. Disparado por @Scheduled o manualmente (admin/import). */
    @Scheduled(fixedDelayString = "${academconnect.mail.drain-fixed-delay-ms:30000}")
    @Transactional
    public void drenar() {
        List<MailPendiente> lote = repo.findByEstadoOrderByCreatedAtAsc(EstadoMail.PENDIENTE, Pageable.ofSize(loteSize));
        for (MailPendiente m : lote) {
            try {
                MimeMessage mime = mailSender.createMimeMessage();
                MimeMessageHelper h = new MimeMessageHelper(mime, true, "UTF-8");
                h.setFrom(from);
                h.setTo(m.getDestinatario());
                h.setSubject(m.getAsunto());
                h.setText(m.getCuerpoTexto(), m.getCuerpoHtml());
                mailSender.send(mime);
                m.setEstado(EstadoMail.ENVIADO);
                m.setEnviadoEn(OffsetDateTime.now());
            } catch (Exception e) {
                m.setIntentos(m.getIntentos() + 1);
                m.setUltimoError(e.getMessage() == null ? "error" : e.getMessage().substring(0, Math.min(500, e.getMessage().length())));
                if (m.getIntentos() >= MAX_INTENTOS) {
                    m.setEstado(EstadoMail.FALLIDO);
                    log.warn("Mail a {} falló definitivamente: {}", m.getDestinatario(), m.getUltimoError());
                }
            }
            repo.save(m);
        }
    }
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=MailServiceTests`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/academconnect/service/MailService.java src/test/java/com/academconnect/service/MailServiceTests.java
git commit -m "feat(mail): MailService encolar + drenar en oleadas con reintentos"
```

---

## Phase 3 — Self-request y cola admin de solicitudes

### Task 3.1: RateLimiterService (in-memory sliding window)

**Files:**
- Create: `service/RateLimiterService.java`
- Test: `src/test/java/com/academconnect/service/RateLimiterServiceTests.java`

- [ ] **Step 1: Test que falla (unit, sin Spring)**

```java
class RateLimiterServiceTests {
    @Test
    void permiteHastaElLimiteYLuegoBloquea() {
        var rl = new RateLimiterService();
        for (int i = 0; i < 3; i++) assertThat(rl.permitir("k", 3, java.time.Duration.ofMinutes(1))).isTrue();
        assertThat(rl.permitir("k", 3, java.time.Duration.ofMinutes(1))).isFalse();
    }
    @Test
    void clavesDistintasNoInterfieren() {
        var rl = new RateLimiterService();
        assertThat(rl.permitir("a", 1, java.time.Duration.ofMinutes(1))).isTrue();
        assertThat(rl.permitir("b", 1, java.time.Duration.ofMinutes(1))).isTrue();
    }
}
```

- [ ] **Step 2: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=RateLimiterServiceTests`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```java
package com.academconnect.service;

import org.springframework.stereotype.Service;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Rate limiter in-memory por clave (sliding window). Suficiente para single-instance (prototipo);
 * para multi-instancia migrar a un store compartido (Redis/Bucket4j).
 */
@Service
public class RateLimiterService {

    private final Map<String, Deque<Instant>> hits = new ConcurrentHashMap<>();

    public synchronized boolean permitir(String clave, int maximo, Duration ventana) {
        Instant ahora = Instant.now();
        Instant limite = ahora.minus(ventana);
        Deque<Instant> q = hits.computeIfAbsent(clave, k -> new ArrayDeque<>());
        while (!q.isEmpty() && q.peekFirst().isBefore(limite)) q.pollFirst();
        if (q.size() >= maximo) return false;
        q.addLast(ahora);
        return true;
    }
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=RateLimiterServiceTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/academconnect/service/RateLimiterService.java src/test/java/com/academconnect/service/RateLimiterServiceTests.java
git commit -m "feat(security): RateLimiterService in-memory sliding window"
```

### Task 3.2: Migración V23 + entidad SolicitudCuenta + repositorio

**Files:**
- Create: `db/migration/V23__solicitud_cuenta.sql`, `domain/EstadoSolicitud.java`, `domain/SolicitudCuenta.java`, `repository/SolicitudCuentaRepository.java`

- [ ] **Step 1: Migración**

```sql
CREATE TABLE solicitud_cuenta (
    id BIGSERIAL PRIMARY KEY,
    matricula VARCHAR(30) NOT NULL,
    email VARCHAR(255) NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    motivo_rechazo VARCHAR(500),
    decidido_por_id BIGINT REFERENCES usuario(id),
    decidido_en TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    updated_by VARCHAR(100) NOT NULL,
    CONSTRAINT chk_solicitud_estado CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA'))
);

CREATE INDEX idx_solicitud_estado ON solicitud_cuenta(estado);
```

- [ ] **Step 2: Enum + entidad + repositorio**

```java
package com.academconnect.domain;
public enum EstadoSolicitud { PENDIENTE, APROBADA, RECHAZADA }
```
```java
package com.academconnect.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.OffsetDateTime;

@Entity
@Table(name = "solicitud_cuenta")
@Getter
@Setter
public class SolicitudCuenta extends BaseEntity {
    @Column(nullable = false, length = 30) private String matricula;
    @Column(nullable = false, length = 255) private String email;
    @Column(nullable = false, length = 200) private String nombre;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private EstadoSolicitud estado = EstadoSolicitud.PENDIENTE;
    @Column(name = "motivo_rechazo", length = 500) private String motivoRechazo;
    @Column(name = "decidido_por_id") private Long decididoPorId;
    @Column(name = "decidido_en") private OffsetDateTime decididoEn;
}
```
```java
package com.academconnect.repository;

import com.academconnect.domain.EstadoSolicitud;
import com.academconnect.domain.SolicitudCuenta;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.OffsetDateTime;
import java.util.List;

public interface SolicitudCuentaRepository extends JpaRepository<SolicitudCuenta, Long> {

    @Query("""
        SELECT s FROM SolicitudCuenta s
        WHERE (:estado IS NULL OR s.estado = :estado)
          AND (:patron IS NULL OR lower(s.nombre) LIKE :patron OR lower(s.email) LIKE :patron OR lower(s.matricula) LIKE :patron)
        ORDER BY s.createdAt DESC
        """)
    Page<SolicitudCuenta> buscar(@Param("estado") EstadoSolicitud estado,
                                 @Param("patron") String patron, Pageable pageable);

    List<SolicitudCuenta> findByEstadoInAndUpdatedAtBefore(List<EstadoSolicitud> estados, OffsetDateTime antes);
}
```

> Nota de no-repetir-bug: la query usa `lower(...)` sobre columnas de texto (no bytea). Testear con datos reales (Task 3.6) — el bug `lower(bytea)` se escapó por mockear el repo.

- [ ] **Step 3: Verificar mapeo + query**

Run: `./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/resources/db/migration/V23__solicitud_cuenta.sql src/main/java/com/academconnect/domain/EstadoSolicitud.java src/main/java/com/academconnect/domain/SolicitudCuenta.java src/main/java/com/academconnect/repository/SolicitudCuentaRepository.java
git commit -m "feat(db): V23 solicitud_cuenta + entidad y repositorio"
```

### Task 3.3: TipoActividad — nuevas constantes

**Files:**
- Modify: `domain/TipoActividad.java`

- [ ] **Step 1: Agregar al enum (sin borrar las existentes)**

```java
    SOLICITUD_CUENTA_ENVIADA,
    SOLICITUD_CUENTA_APROBADA,
    SOLICITUD_CUENTA_RECHAZADA,
    CUENTA_INVITADA_CREADA,
    CUENTA_ACTIVADA,
    ENLACE_PASSWORD_ENVIADO,
    PASSWORD_RESTABLECIDA,
    IMPORTACION_CONFIRMADA,
```

- [ ] **Step 2: Verificar compila**

Run: `./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/academconnect/domain/TipoActividad.java
git commit -m "feat(actividad): tipos de evento de onboarding"
```

### Task 3.4: OnboardingService — crear solicitud (self-request) con rate-limit

**Files:**
- Create: `dto/SolicitudCuentaRequest.java`
- Modify: `service/OnboardingService.java`, `controller/OnboardingController.java`
- Test: extender `OnboardingControllerTests`

- [ ] **Step 1: DTO**

```java
package com.academconnect.dto;

import jakarta.validation.constraints.*;

public record SolicitudCuentaRequest(
        @NotBlank @Size(max = 30) String matricula,
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Size(max = 200) String nombre) {
}
```

- [ ] **Step 2: Test que falla**

```java
@Test
void solicitarCuentaDevuelve202GenericoYPersiste() throws Exception {
    mockMvc.perform(post("/auth/solicitudes").contentType(MediaType.APPLICATION_JSON)
            .content("{\"matricula\":\"2024001\",\"email\":\"nuevo@academ.test\",\"nombre\":\"Nuevo\"}"))
        .andExpect(status().isAccepted());
    assertThat(solicitudRepository.findAll()).anyMatch(s -> s.getMatricula().equals("2024001"));
}
```

(Inyectar `SolicitudCuentaRepository solicitudRepository` en el test.)

- [ ] **Step 3: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=OnboardingControllerTests`
Expected: FAIL.

- [ ] **Step 4: Implementar en OnboardingService**

Agregar dependencias `SolicitudCuentaRepository solicitudRepository` y `ApplicationEventPublisher eventos`:

```java
@Transactional
public void crearSolicitud(String matricula, String email, String nombre) {
    SolicitudCuenta s = new SolicitudCuenta();
    s.setMatricula(matricula.trim());
    s.setEmail(email.trim().toLowerCase());
    s.setNombre(nombre.trim());
    solicitudRepository.save(s);
    eventos.publishEvent(ActividadEvent.of(
            TipoActividad.SOLICITUD_CUENTA_ENVIADA, null, "SOLICITUD_CUENTA", s.getId(),
            java.util.Map.of("matricula", s.getMatricula()),
            VisibilidadActividad.PRIVADA, java.util.List.of()));
}
```

- [ ] **Step 5: Implementar endpoint con rate-limit**

En `OnboardingController` inyectar `RateLimiterService rateLimiter`:

```java
@PostMapping("/solicitudes")
@ResponseStatus(HttpStatus.ACCEPTED)
public Map<String, String> solicitar(@Valid @RequestBody SolicitudCuentaRequest req,
                                      HttpServletRequest http) {
    if (!rateLimiter.permitir("solicitud:" + http.getRemoteAddr(), 5, Duration.ofHours(1))) {
        throw new RateLimitException();
    }
    onboardingService.crearSolicitud(req.matricula(), req.email(), req.nombre());
    return Map.of("mensaje", "Si corresponde, enviaremos un enlace al correo indicado.");
}
```

> `RateLimitException` → handler que devuelve `429` con `type = urn:academconnect:error:rate-limit`. Crear `exception/RateLimitException.java` y su `@ExceptionHandler` en el `@ControllerAdvice` existente. **Verificar el advice real** y seguir su patrón de `ProblemDetail`.

- [ ] **Step 6: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=OnboardingControllerTests`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/java/com/academconnect/dto/SolicitudCuentaRequest.java src/main/java/com/academconnect/service/OnboardingService.java src/main/java/com/academconnect/controller/OnboardingController.java src/main/java/com/academconnect/exception/RateLimitException.java src/test/java/com/academconnect/controller/OnboardingControllerTests.java
git commit -m "feat(onboarding): POST /auth/solicitudes (self-request) con rate-limit y respuesta genérica"
```

### Task 3.5: recuperar-password y reenviar-activacion

**Files:**
- Create: `dto/EmailRequest.java`
- Modify: `service/OnboardingService.java`, `controller/OnboardingController.java`
- Test: extender `OnboardingControllerTests`

- [ ] **Step 1: DTO**

```java
package com.academconnect.dto;
import jakarta.validation.constraints.*;
public record EmailRequest(@NotBlank @Email @Size(max = 255) String email) {}
```

- [ ] **Step 2: Test que falla**

```java
@Test
void recuperarSiempreDevuelve202AunqueElEmailNoExista() throws Exception {
    mockMvc.perform(post("/auth/password/recuperar").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"fantasma@academ.test\"}"))
        .andExpect(status().isAccepted());
}

@Test
void recuperarEncolaMailYTokenResetParaCuentaActiva() throws Exception {
    estudianteService.crear(new EstudianteRequest("activa2@academ.test","x".repeat(8),"A",null,null,null));
    mockMvc.perform(post("/auth/password/recuperar").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"activa2@academ.test\"}"))
        .andExpect(status().isAccepted());
    assertThat(mailRepo.findByEstadoOrderByCreatedAtAsc(EstadoMail.PENDIENTE, Pageable.ofSize(10))).hasSize(1);
}
```

- [ ] **Step 3: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=OnboardingControllerTests`
Expected: FAIL.

- [ ] **Step 4: Implementar en OnboardingService**

Inyectar `MailService mailService`, `MailTemplateService templates`:

```java
/** Emite RESET solo si la cuenta existe y está ACTIVA; encola mail. Silencioso si no aplica. */
@Transactional
public void solicitarReset(String email) {
    usuarioRepository.findByEmail(email.trim().toLowerCase())
        .filter(u -> u.getEstadoCuenta() == EstadoCuenta.ACTIVA)
        .ifPresent(u -> {
            String token = tokenService.emitir(u.getId(), PropositoToken.RESET);
            var c = templates.restablecer(u.getNombre(), token);
            mailService.encolar(u.getEmail(), c.asunto(), c.html(), c.texto());
        });
}

/** Reemite ACTIVACION solo si la cuenta existe y está INVITADA; encola mail. Silencioso si no aplica. */
@Transactional
public void reenviarActivacion(String email) {
    usuarioRepository.findByEmail(email.trim().toLowerCase())
        .filter(u -> u.getEstadoCuenta() == EstadoCuenta.INVITADA)
        .ifPresent(u -> {
            String token = tokenService.emitir(u.getId(), PropositoToken.ACTIVACION);
            var c = templates.activacion(u.getNombre(), token);
            mailService.encolar(u.getEmail(), c.asunto(), c.html(), c.texto());
        });
}
```

- [ ] **Step 5: Endpoints (con rate-limit por email+IP)**

```java
@PostMapping("/password/recuperar")
@ResponseStatus(HttpStatus.ACCEPTED)
public Map<String,String> recuperar(@Valid @RequestBody EmailRequest req, HttpServletRequest http) {
    if (!rateLimiter.permitir("recuperar:" + req.email() + ":" + http.getRemoteAddr(), 5, Duration.ofHours(1)))
        throw new RateLimitException();
    onboardingService.solicitarReset(req.email());
    return Map.of("mensaje", "Si corresponde, enviaremos un enlace al correo indicado.");
}

@PostMapping("/activacion/reenviar")
@ResponseStatus(HttpStatus.ACCEPTED)
public Map<String,String> reenviar(@Valid @RequestBody EmailRequest req, HttpServletRequest http) {
    if (!rateLimiter.permitir("reenviar:" + req.email() + ":" + http.getRemoteAddr(), 5, Duration.ofHours(1)))
        throw new RateLimitException();
    onboardingService.reenviarActivacion(req.email());
    return Map.of("mensaje", "Si corresponde, enviaremos un enlace al correo indicado.");
}
```

- [ ] **Step 6: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=OnboardingControllerTests`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/java/com/academconnect/dto/EmailRequest.java src/main/java/com/academconnect/service/OnboardingService.java src/main/java/com/academconnect/controller/OnboardingController.java src/test/java/com/academconnect/controller/OnboardingControllerTests.java
git commit -m "feat(onboarding): recuperar-password y reenviar-activacion (genéricos, encolan mail)"
```

### Task 3.6: Admin — listar/aprobar/rechazar solicitudes

**Files:**
- Create: `dto/SolicitudResponse.java`, `dto/RechazoRequest.java`, `controller/AdminSolicitudController.java`
- Modify: `service/OnboardingService.java` (aprobar/rechazar + crear INVITADA)
- Test: `src/test/java/com/academconnect/controller/AdminSolicitudControllerTests.java`

- [ ] **Step 1: DTOs**

```java
package com.academconnect.dto;
import com.academconnect.domain.EstadoSolicitud;
import java.time.OffsetDateTime;
public record SolicitudResponse(Long id, String matricula, String email, String nombre,
        EstadoSolicitud estado, String motivoRechazo, OffsetDateTime createdAt) {}
```
```java
package com.academconnect.dto;
import jakarta.validation.constraints.*;
public record RechazoRequest(@NotBlank @Size(max = 500) String motivo) {}
```

- [ ] **Step 2: Test de integración que falla (con @WithMockUser admin)**

```java
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
@Import(TestcontainersConfiguration.class) @Transactional
class AdminSolicitudControllerTests {
    @Autowired MockMvc mockMvc;
    @Autowired SolicitudCuentaRepository repo;
    @Autowired UsuarioRepository usuarioRepository;

    private Long seedSolicitud() {
        var s = new SolicitudCuenta();
        s.setMatricula("2024777"); s.setEmail("ped@academ.test"); s.setNombre("Ped");
        return repo.save(s).getId();
    }

    @Test
    @WithMockUser(roles = "ADMINISTRADOR")
    void aprobarCreaCuentaInvitadaEstudiante() throws Exception {
        Long id = seedSolicitud();
        mockMvc.perform(post("/admin/solicitudes/" + id + "/aprobar"))
            .andExpect(status().isOk());
        var u = usuarioRepository.findByEmail("ped@academ.test").orElseThrow();
        assertThat(u.getEstadoCuenta()).isEqualTo(EstadoCuenta.INVITADA);
        assertThat(u.getPassword()).isNull();
        assertThat(u.getMatricula()).isEqualTo("2024777");
        assertThat(repo.findById(id).orElseThrow().getEstado()).isEqualTo(EstadoSolicitud.APROBADA);
    }

    @Test
    @WithMockUser(roles = "ESTUDIANTE")
    void noAdminRecibe403() throws Exception {
        mockMvc.perform(get("/admin/solicitudes")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ADMINISTRADOR")
    void rechazarGuardaMotivo() throws Exception {
        Long id = seedSolicitud();
        mockMvc.perform(post("/admin/solicitudes/" + id + "/rechazar")
                .contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"matrícula no coincide\"}"))
            .andExpect(status().isOk());
        assertThat(repo.findById(id).orElseThrow().getEstado()).isEqualTo(EstadoSolicitud.RECHAZADA);
        assertThat(repo.findById(id).orElseThrow().getMotivoRechazo()).isEqualTo("matrícula no coincide");
    }
}
```

- [ ] **Step 3: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=AdminSolicitudControllerTests`
Expected: FAIL.

- [ ] **Step 4: Implementar aprobar/rechazar en OnboardingService**

Necesita crear un `Estudiante` INVITADA. Reusar el patrón de `EstudianteService`/`AdminUsuarioService` para instanciar la subclase. Inyectar lo necesario:

```java
@Transactional
public SolicitudResponse aprobar(Long solicitudId, Long adminId) {
    var s = solicitudRepository.findById(solicitudId)
            .orElseThrow(() -> new BusinessException("solicitud-inexistente"));
    String email = s.getEmail().toLowerCase();
    if (usuarioRepository.findByEmail(email).isPresent() || usuarioRepository.existsByMatricula(s.getMatricula())) {
        throw new BusinessException("conflicto-identidad");
    }
    Estudiante u = new Estudiante();
    u.setEmail(email);
    u.setMatricula(s.getMatricula());
    u.setNombre(s.getNombre());
    u.setActivo(true);
    u.setEstadoCuenta(EstadoCuenta.INVITADA);
    u.setPassword(null);
    usuarioRepository.save(u);

    s.setEstado(EstadoSolicitud.APROBADA);
    s.setDecididoPorId(adminId);
    s.setDecididoEn(OffsetDateTime.now());

    String token = tokenService.emitir(u.getId(), PropositoToken.ACTIVACION);
    var c = templates.activacion(u.getNombre(), token);
    mailService.encolar(u.getEmail(), c.asunto(), c.html(), c.texto());

    eventos.publishEvent(ActividadEvent.of(TipoActividad.SOLICITUD_CUENTA_APROBADA, adminId,
            "SOLICITUD_CUENTA", s.getId(), Map.of("matricula", s.getMatricula()),
            VisibilidadActividad.PRIVADA, List.of()));
    eventos.publishEvent(ActividadEvent.of(TipoActividad.CUENTA_INVITADA_CREADA, adminId,
            "USUARIO", u.getId(), Map.of("matricula", u.getMatricula()),
            VisibilidadActividad.PRIVADA, List.of()));
    return toResponse(s);
}

@Transactional
public SolicitudResponse rechazar(Long solicitudId, Long adminId, String motivo) {
    var s = solicitudRepository.findById(solicitudId)
            .orElseThrow(() -> new BusinessException("solicitud-inexistente"));
    s.setEstado(EstadoSolicitud.RECHAZADA);
    s.setMotivoRechazo(motivo);
    s.setDecididoPorId(adminId);
    s.setDecididoEn(OffsetDateTime.now());
    eventos.publishEvent(ActividadEvent.of(TipoActividad.SOLICITUD_CUENTA_RECHAZADA, adminId,
            "SOLICITUD_CUENTA", s.getId(), Map.of("matricula", s.getMatricula()),
            VisibilidadActividad.PRIVADA, List.of()));
    return toResponse(s);
}

@Transactional(readOnly = true)
public Page<SolicitudResponse> buscar(EstadoSolicitud estado, String q, Pageable pageable) {
    String patron = (q == null || q.isBlank()) ? null : "%" + q.trim().toLowerCase() + "%";
    return solicitudRepository.buscar(estado, patron, pageable).map(this::toResponse);
}

private SolicitudResponse toResponse(SolicitudCuenta s) {
    return new SolicitudResponse(s.getId(), s.getMatricula(), s.getEmail(), s.getNombre(),
            s.getEstado(), s.getMotivoRechazo(), s.getCreatedAt());
}
```

> Confirmar que `UsuarioRepository` tiene `existsByMatricula(String)`; si no, agregarlo (deriva el query). Confirmar el getter de timestamp de `BaseEntity` (`getCreatedAt()`).

- [ ] **Step 5: Implementar controller**

```java
package com.academconnect.controller;

import com.academconnect.domain.EstadoSolicitud;
import com.academconnect.dto.RechazoRequest;
import com.academconnect.dto.SolicitudResponse;
import com.academconnect.service.OnboardingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/admin/solicitudes")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMINISTRADOR')")
public class AdminSolicitudController {

    private final OnboardingService onboardingService;

    @GetMapping
    public Page<SolicitudResponse> listar(@RequestParam(required = false) EstadoSolicitud estado,
                                          @RequestParam(required = false) String q,
                                          @PageableDefault(size = 10) Pageable pageable) {
        return onboardingService.buscar(estado, q, pageable);
    }

    @PostMapping("/{id}/aprobar")
    public SolicitudResponse aprobar(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return onboardingService.aprobar(id, jwt.getClaim("userId"));
    }

    @PostMapping("/{id}/rechazar")
    public SolicitudResponse rechazar(@PathVariable Long id, @Valid @RequestBody RechazoRequest req,
                                      @AuthenticationPrincipal Jwt jwt) {
        return onboardingService.rechazar(id, jwt.getClaim("userId"), req.motivo());
    }
}
```

> Confirmar cómo otros controllers admin obtienen el id del usuario autenticado (el report mostró `Authentication authn` en `AdminUsuarioController`). Seguir ese patrón exacto — si usan un helper para extraer `userId`, reusarlo en lugar de `jwt.getClaim`.

- [ ] **Step 6: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=AdminSolicitudControllerTests`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/main/java/com/academconnect/dto/SolicitudResponse.java src/main/java/com/academconnect/dto/RechazoRequest.java src/main/java/com/academconnect/controller/AdminSolicitudController.java src/main/java/com/academconnect/service/OnboardingService.java src/test/java/com/academconnect/controller/AdminSolicitudControllerTests.java
git commit -m "feat(admin): cola de solicitudes (listar/aprobar/rechazar) con eventos de actividad"
```

---

## Phase 4 — Alta manual admin → INVITADA + reemplazo de reset

### Task 4.1: Alta manual de usuario crea INVITADA + activación (sin password)

**Files:**
- Modify: `dto/AdminUsuarioCreateRequest.java` (quitar `password`)
- Modify: `service/AdminUsuarioService.java` (`crear` → INVITADA + token + mail)
- Test: `src/test/java/com/academconnect/service/AdminUsuarioServiceTests.java` (existe; convertir el relevante a integración o agregar uno de integración nuevo)

- [ ] **Step 1: Quitar `password` del DTO**

En `AdminUsuarioCreateRequest`, eliminar la línea `@NotBlank @Size(min = 8, max = 255) String password,`. El record queda con `rol, email, matricula, nombre, edad, ubicacion, titulacion, cargo, institucion, titulo`.

- [ ] **Step 2: Test de integración que falla**

```java
@SpringBootTest @ActiveProfiles("test") @Import(TestcontainersConfiguration.class) @Transactional
class AdminUsuarioOnboardingTests {
    @Autowired AdminUsuarioService service;
    @Autowired UsuarioRepository usuarioRepository;
    @Autowired MailPendienteRepository mailRepo;

    @Test
    void crearGeneraCuentaInvitadaSinPasswordYEncolaActivacion() {
        var resp = service.crear(new AdminUsuarioCreateRequest(
                Rol.EXTERNO, "ext@academ.test", "EXT-1", "Externo Uno",
                null, null, null, null, "UNL", "Dr."));
        var u = usuarioRepository.findById(resp.id()).orElseThrow();
        assertThat(u.getEstadoCuenta()).isEqualTo(EstadoCuenta.INVITADA);
        assertThat(u.getPassword()).isNull();
        assertThat(mailRepo.findByEstadoOrderByCreatedAtAsc(EstadoMail.PENDIENTE, Pageable.ofSize(10))).hasSize(1);
    }
}
```

(Ajustar el orden de args de `AdminUsuarioCreateRequest` al definitivo tras quitar `password`.)

- [ ] **Step 3: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=AdminUsuarioOnboardingTests`
Expected: FAIL — `crear` aún exige/encripta password.

- [ ] **Step 4: Modificar `AdminUsuarioService.crear`**

Quitar el encode de password; setear INVITADA y password null; emitir token ACTIVACION y encolar. Inyectar `TokenCuentaService`, `MailService`, `MailTemplateService`:

```java
// dentro de crear(...), tras construir la entidad y antes de devolver:
u.setActivo(true);
u.setEstadoCuenta(EstadoCuenta.INVITADA);
u.setPassword(null);
var guardado = repository.save(u);

String token = tokenService.emitir(guardado.getId(), PropositoToken.ACTIVACION);
var c = templates.activacion(guardado.getNombre(), token);
mailService.encolar(guardado.getEmail(), c.asunto(), c.html(), c.texto());
// (eliminar cualquier passwordEncoder.encode(req.password()))
```

> El test unitario existente `AdminUsuarioServiceTests` que mockea repos y verifica el encode de password **se romperá**: actualizarlo para reflejar el nuevo contrato (INVITADA, sin password) o moverlo a integración. No dejar el viejo assert de password.

- [ ] **Step 5: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=AdminUsuarioOnboardingTests,AdminUsuarioServiceTests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/academconnect/dto/AdminUsuarioCreateRequest.java src/main/java/com/academconnect/service/AdminUsuarioService.java src/test/java/com/academconnect/service/AdminUsuarioServiceTests.java src/test/java/com/academconnect/service/AdminUsuarioOnboardingTests.java
git commit -m "feat(admin): alta manual crea cuenta INVITADA + activación por token (sin password)"
```

### Task 4.2: Reemplazar reset-password admin por enviar-enlace

**Files:**
- Modify: `controller/AdminUsuarioController.java`, `service/AdminUsuarioService.java`
- Delete: `dto/AdminPasswordResetRequest.java`
- Test: integración nueva

- [ ] **Step 1: Test que falla**

```java
@Test
@WithMockUser(roles = "ADMINISTRADOR")
void enviarEnlaceEmiteResetParaCuentaActivaYEncola() throws Exception {
    var resp = estudianteService.crear(new EstudianteRequest("u@academ.test","x".repeat(8),"U",null,null,null));
    mockMvc.perform(post("/admin/usuarios/" + resp.id() + "/enviar-enlace-password"))
        .andExpect(status().isNoContent());
    assertThat(mailRepo.findByEstadoOrderByCreatedAtAsc(EstadoMail.PENDIENTE, Pageable.ofSize(10))).hasSize(1);
}
```

- [ ] **Step 2: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=AdminUsuarioControllerTests` (o la clase de test admin existente)
Expected: FAIL.

- [ ] **Step 3: Implementar en servicio**

```java
@Transactional
public void enviarEnlacePassword(Long id) {
    var u = repository.findById(id).orElseThrow(() -> new BusinessException("usuario-inexistente"));
    PropositoToken proposito = u.getEstadoCuenta() == EstadoCuenta.ACTIVA
            ? PropositoToken.RESET : PropositoToken.ACTIVACION;
    String token = tokenService.emitir(u.getId(), proposito);
    var c = proposito == PropositoToken.RESET
            ? templates.restablecer(u.getNombre(), token)
            : templates.activacion(u.getNombre(), token);
    mailService.encolar(u.getEmail(), c.asunto(), c.html(), c.texto());
    eventos.publishEvent(ActividadEvent.of(TipoActividad.ENLACE_PASSWORD_ENVIADO, null,
            "USUARIO", u.getId(), Map.of("proposito", proposito.name()),
            VisibilidadActividad.PRIVADA, List.of()));
}
```

- [ ] **Step 4: Reemplazar endpoint en el controller**

Quitar `resetPassword(...)` y `AdminPasswordResetRequest`; agregar:

```java
@PostMapping("/{id}/enviar-enlace-password")
@ResponseStatus(HttpStatus.NO_CONTENT)
public void enviarEnlace(@PathVariable Long id) {
    service.enviarEnlacePassword(id);
}
```

Borrar el archivo `dto/AdminPasswordResetRequest.java`.

- [ ] **Step 5: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=AdminUsuarioControllerTests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/academconnect/controller/AdminUsuarioController.java src/main/java/com/academconnect/service/AdminUsuarioService.java src/test/java/com/academconnect/controller/AdminUsuarioControllerTests.java
git rm src/main/java/com/academconnect/dto/AdminPasswordResetRequest.java
git commit -m "feat(admin): reemplazar reset-password por enviar-enlace-password (el admin nunca setea contraseñas)"
```

---

## Phase 5 — Importación masiva (preview/commit)

### Task 5.1: Migración V24 — lote_importacion + items + FK en usuario

**Files:**
- Create: `db/migration/V24__lote_importacion.sql`

- [ ] **Step 1: Migración**

```sql
CREATE TABLE lote_importacion (
    id BIGSERIAL PRIMARY KEY,
    archivo_hash VARCHAR(64) NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PREVIEW',
    total INT NOT NULL DEFAULT 0,
    nuevos INT NOT NULL DEFAULT 0,
    existentes INT NOT NULL DEFAULT 0,
    errores INT NOT NULL DEFAULT 0,
    creado_por_id BIGINT REFERENCES usuario(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    updated_by VARCHAR(100) NOT NULL,
    CONSTRAINT chk_lote_estado CHECK (estado IN ('PREVIEW','CONFIRMADO'))
);

CREATE TABLE lote_importacion_item (
    id BIGSERIAL PRIMARY KEY,
    lote_id BIGINT NOT NULL REFERENCES lote_importacion(id) ON DELETE CASCADE,
    linea INT NOT NULL,
    matricula VARCHAR(30),
    email VARCHAR(255),
    nombre VARCHAR(200),
    resultado VARCHAR(30) NOT NULL,
    detalle VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    updated_by VARCHAR(100) NOT NULL,
    CONSTRAINT chk_item_resultado CHECK (resultado IN
        ('NUEVO','EXISTE_ACTIVA','EXISTE_INVITADA','COLISION_EMAIL','COLISION_MATRICULA','ERROR_FORMATO'))
);

CREATE INDEX idx_lote_item_lote ON lote_importacion_item(lote_id);

ALTER TABLE usuario ADD COLUMN lote_importacion_id BIGINT REFERENCES lote_importacion(id);
```

- [ ] **Step 2: Verificar Flyway**

Run: `./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/resources/db/migration/V24__lote_importacion.sql
git commit -m "feat(db): V24 lote_importacion + items + vínculo usuario↔lote"
```

### Task 5.2: Entidades de lote + repositorios + FK en Usuario

**Files:**
- Create: `domain/EstadoLote.java`, `domain/ResultadoFila.java`, `domain/LoteImportacion.java`, `domain/LoteImportacionItem.java`, `repository/LoteImportacionRepository.java`
- Modify: `domain/Usuario.java` (campo `loteImportacionId`)

- [ ] **Step 1: Enums**

```java
package com.academconnect.domain;
public enum EstadoLote { PREVIEW, CONFIRMADO }
```
```java
package com.academconnect.domain;
public enum ResultadoFila { NUEVO, EXISTE_ACTIVA, EXISTE_INVITADA, COLISION_EMAIL, COLISION_MATRICULA, ERROR_FORMATO }
```

- [ ] **Step 2: Entidades**

```java
package com.academconnect.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "lote_importacion")
@Getter
@Setter
public class LoteImportacion extends BaseEntity {
    @Column(name = "archivo_hash", nullable = false, length = 64) private String archivoHash;
    @Column(name = "nombre_archivo", nullable = false, length = 255) private String nombreArchivo;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private EstadoLote estado = EstadoLote.PREVIEW;
    @Column(nullable = false) private int total;
    @Column(nullable = false) private int nuevos;
    @Column(nullable = false) private int existentes;
    @Column(nullable = false) private int errores;
    @Column(name = "creado_por_id") private Long creadoPorId;

    @OneToMany(mappedBy = "loteId", cascade = CascadeType.ALL, orphanRemoval = true)
    private java.util.List<LoteImportacionItem> items = new java.util.ArrayList<>();
}
```

> Para `@OneToMany(mappedBy=...)` con una columna escalar `loteId`, lo más simple y robusto es mapear la relación por columna. Alternativa recomendada: que `LoteImportacionItem` tenga `@ManyToOne LoteImportacion lote` y `LoteImportacion` use `mappedBy = "lote"`. Elegir esa variante:

```java
package com.academconnect.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "lote_importacion_item")
@Getter
@Setter
public class LoteImportacionItem extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "lote_id", nullable = false)
    private LoteImportacion lote;
    @Column(nullable = false) private int linea;
    @Column(length = 30) private String matricula;
    @Column(length = 255) private String email;
    @Column(length = 200) private String nombre;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 30) private ResultadoFila resultado;
    @Column(length = 500) private String detalle;
}
```

Y en `LoteImportacion`: `@OneToMany(mappedBy = "lote", ...)`.

- [ ] **Step 3: Repositorio + FK en Usuario**

```java
package com.academconnect.repository;

import com.academconnect.domain.EstadoLote;
import com.academconnect.domain.LoteImportacion;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.OffsetDateTime;
import java.util.List;

public interface LoteImportacionRepository extends JpaRepository<LoteImportacion, Long> {
    List<LoteImportacion> findByEstadoAndCreatedAtBefore(EstadoLote estado, OffsetDateTime antes);
}
```

En `Usuario.java`: `@Column(name = "lote_importacion_id") private Long loteImportacionId;`

- [ ] **Step 4: Verificar mapeo**

Run: `./mvnw -q test -Dtest=AcademconnectApplicationTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/academconnect/domain/EstadoLote.java src/main/java/com/academconnect/domain/ResultadoFila.java src/main/java/com/academconnect/domain/LoteImportacion.java src/main/java/com/academconnect/domain/LoteImportacionItem.java src/main/java/com/academconnect/repository/LoteImportacionRepository.java src/main/java/com/academconnect/domain/Usuario.java
git commit -m "feat(domain): entidades de lote de importación + vínculo en Usuario"
```

### Task 5.3: Parser CSV + clasificación de filas (preview)

**Files:**
- Create: `dto/ImportPreviewResponse.java`, `dto/ImportItemResponse.java`
- Create: `service/ImportacionUsuariosService.java` (método `preview`)
- Test: `src/test/java/com/academconnect/service/ImportacionUsuariosServiceTests.java`

- [ ] **Step 1: DTOs**

```java
package com.academconnect.dto;
import com.academconnect.domain.ResultadoFila;
public record ImportItemResponse(int linea, String matricula, String email, String nombre,
        ResultadoFila resultado, String detalle) {}
```
```java
package com.academconnect.dto;
import java.util.List;
public record ImportPreviewResponse(Long loteId, int total, int nuevos, int existentes, int errores,
        List<ImportItemResponse> items) {}
```

- [ ] **Step 2: Test que falla (queries reales)**

```java
@SpringBootTest @ActiveProfiles("test") @Import(TestcontainersConfiguration.class) @Transactional
class ImportacionUsuariosServiceTests {
    @Autowired ImportacionUsuariosService service;
    @Autowired UsuarioRepository usuarioRepository;
    @Autowired EstudianteService estudianteService;

    @Test
    void previewClasificaNuevosExistentesYColisiones() {
        // existente ACTIVA con email e1 / matricula M-EXISTE
        var resp = estudianteService.crear(new EstudianteRequest("e1@academ.test","x".repeat(8),"E1",null,null,null));
        var u = usuarioRepository.findById(resp.id()).orElseThrow();
        u.setMatricula("M-EXISTE"); usuarioRepository.save(u);

        String csv = String.join("\n",
            "email,matricula,nombre",
            "nuevo@academ.test,M-NUEVO,Nuevo",      // NUEVO
            "e1@academ.test,M-EXISTE,E1",           // EXISTE_ACTIVA (par exacto)
            "otro@academ.test,M-EXISTE,Otro",       // COLISION_MATRICULA (matrícula con email distinto)
            "e1@academ.test,M-OTRA,EE",             // COLISION_EMAIL (email usado por otra matrícula)
            "malformada-sin-campos");               // ERROR_FORMATO

        var preview = service.preview("padron.csv", csv.getBytes(java.nio.charset.StandardCharsets.UTF_8), 1L);

        assertThat(preview.total()).isEqualTo(5);
        assertThat(preview.nuevos()).isEqualTo(1);
        assertThat(preview.existentes()).isEqualTo(1);
        assertThat(preview.errores()).isEqualTo(3); // 2 colisiones + 1 formato
        assertThat(preview.loteId()).isNotNull();
    }
}
```

- [ ] **Step 3: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=ImportacionUsuariosServiceTests`
Expected: FAIL.

- [ ] **Step 4: Implementar `preview`**

Usa Apache Commons CSV; clasifica cada fila; persiste `LoteImportacion` PREVIEW con items; **no crea usuarios**:

```java
package com.academconnect.service;

import com.academconnect.domain.*;
import com.academconnect.dto.ImportItemResponse;
import com.academconnect.dto.ImportPreviewResponse;
import com.academconnect.repository.LoteImportacionRepository;
import com.academconnect.repository.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

@Service
@RequiredArgsConstructor
public class ImportacionUsuariosService {

    private final UsuarioRepository usuarioRepository;
    private final LoteImportacionRepository loteRepository;
    // (más deps en Task 5.4: TokenCuentaService, MailService, MailTemplateService, eventos)

    @Transactional
    public ImportPreviewResponse preview(String nombreArchivo, byte[] contenido, Long adminId) {
        LoteImportacion lote = new LoteImportacion();
        lote.setNombreArchivo(nombreArchivo);
        lote.setArchivoHash(sha256(contenido));
        lote.setEstado(EstadoLote.PREVIEW);
        lote.setCreadoPorId(adminId);

        List<ImportItemResponse> respuestas = new ArrayList<>();
        int nuevos = 0, existentes = 0, errores = 0, total = 0;

        try (CSVParser parser = CSVFormat.DEFAULT.builder()
                .setHeader().setSkipHeaderRecord(true).setTrim(true)
                .setIgnoreEmptyLines(true).get().parse(new StringReader(new String(contenido, StandardCharsets.UTF_8)))) {

            int linea = 1;
            for (CSVRecord r : parser) {
                linea++;
                total++;
                LoteImportacionItem item = new LoteImportacionItem();
                item.setLote(lote);
                item.setLinea((int) r.getRecordNumber() + 1);

                String email, matricula, nombre;
                try {
                    email = r.get("email").trim().toLowerCase();
                    matricula = r.get("matricula").trim();
                    nombre = r.get("nombre").trim();
                } catch (Exception ex) {
                    item.setResultado(ResultadoFila.ERROR_FORMATO);
                    item.setDetalle("Columnas email,matricula,nombre requeridas");
                    errores++; lote.getItems().add(item);
                    respuestas.add(toResp(item)); continue;
                }
                if (email.isBlank() || matricula.isBlank() || nombre.isBlank()) {
                    item.setResultado(ResultadoFila.ERROR_FORMATO);
                    item.setDetalle("Campos vacíos");
                    errores++;
                } else {
                    item.setEmail(email); item.setMatricula(matricula); item.setNombre(nombre);
                    var porEmail = usuarioRepository.findByEmail(email);
                    var porMatricula = usuarioRepository.findByMatricula(matricula);
                    if (porEmail.isPresent() && porMatricula.isPresent()
                            && porEmail.get().getId().equals(porMatricula.get().getId())) {
                        // par exacto -> ya existe
                        item.setResultado(porEmail.get().getEstadoCuenta() == EstadoCuenta.ACTIVA
                                ? ResultadoFila.EXISTE_ACTIVA : ResultadoFila.EXISTE_INVITADA);
                        existentes++;
                    } else if (porMatricula.isPresent()) {
                        item.setResultado(ResultadoFila.COLISION_MATRICULA);
                        item.setDetalle("La matrícula ya pertenece a otro email"); errores++;
                    } else if (porEmail.isPresent()) {
                        item.setResultado(ResultadoFila.COLISION_EMAIL);
                        item.setDetalle("El email ya pertenece a otra matrícula"); errores++;
                    } else {
                        item.setResultado(ResultadoFila.NUEVO); nuevos++;
                    }
                }
                lote.getItems().add(item);
                respuestas.add(toResp(item));
            }
        } catch (Exception e) {
            throw new com.academconnect.exception.BusinessException("csv-invalido");
        }

        lote.setTotal(total); lote.setNuevos(nuevos);
        lote.setExistentes(existentes); lote.setErrores(errores);
        var guardado = loteRepository.save(lote);
        return new ImportPreviewResponse(guardado.getId(), total, nuevos, existentes, errores, respuestas);
    }

    private ImportItemResponse toResp(LoteImportacionItem i) {
        return new ImportItemResponse(i.getLinea(), i.getMatricula(), i.getEmail(), i.getNombre(),
                i.getResultado(), i.getDetalle());
    }

    private String sha256(byte[] b) {
        try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b)); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
```

> Confirmar que `UsuarioRepository` tiene `findByMatricula(String)`; si no, agregarlo. El `item.setLinea` usa el número de registro del parser para reportar la línea real del error.

- [ ] **Step 5: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=ImportacionUsuariosServiceTests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/academconnect/dto/ImportItemResponse.java src/main/java/com/academconnect/dto/ImportPreviewResponse.java src/main/java/com/academconnect/service/ImportacionUsuariosService.java src/test/java/com/academconnect/service/ImportacionUsuariosServiceTests.java
git commit -m "feat(import): preview/dry-run con clasificación de filas (nuevo/existe/colisión/error)"
```

### Task 5.4: Confirmar lote — crea INVITADAs + encola activaciones (idempotente)

**Files:**
- Create: `dto/ImportConfirmRequest.java`
- Modify: `service/ImportacionUsuariosService.java`
- Test: extender `ImportacionUsuariosServiceTests`

- [ ] **Step 1: DTO**

```java
package com.academconnect.dto;
public record ImportConfirmRequest(boolean reenviarInvitadas) {}
```

- [ ] **Step 2: Test que falla**

```java
@Test
void confirmarCreaSoloLosNuevosComoInvitadosYEncolaUnMailCadaUno() {
    String csv = String.join("\n", "email,matricula,nombre",
        "a@academ.test,MA,A", "b@academ.test,MB,B");
    var preview = service.preview("p.csv", csv.getBytes(StandardCharsets.UTF_8), 1L);

    service.confirmar(preview.loteId(), new ImportConfirmRequest(false), 1L);

    var a = usuarioRepository.findByEmail("a@academ.test").orElseThrow();
    assertThat(a.getEstadoCuenta()).isEqualTo(EstadoCuenta.INVITADA);
    assertThat(a.getLoteImportacionId()).isEqualTo(preview.loteId());
    assertThat(mailRepo.findByEstadoOrderByCreatedAtAsc(EstadoMail.PENDIENTE, Pageable.ofSize(50))).hasSize(2);
}

@Test
void confirmarEsIdempotenteNoRecreaNiPisaExistentes() {
    String csv = String.join("\n","email,matricula,nombre","c@academ.test,MC,C");
    var p1 = service.preview("p.csv", csv.getBytes(StandardCharsets.UTF_8), 1L);
    service.confirmar(p1.loteId(), new ImportConfirmRequest(false), 1L);
    long antes = usuarioRepository.count();
    var p2 = service.preview("p.csv", csv.getBytes(StandardCharsets.UTF_8), 1L);
    service.confirmar(p2.loteId(), new ImportConfirmRequest(false), 1L); // ahora es EXISTE_INVITADA -> skip
    assertThat(usuarioRepository.count()).isEqualTo(antes);
}
```

- [ ] **Step 3: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=ImportacionUsuariosServiceTests`
Expected: FAIL.

- [ ] **Step 4: Implementar `confirmar`**

Inyectar `TokenCuentaService tokenService`, `MailService mailService`, `MailTemplateService templates`, `ApplicationEventPublisher eventos`:

```java
@Transactional
public void confirmar(Long loteId, ImportConfirmRequest req, Long adminId) {
    LoteImportacion lote = loteRepository.findById(loteId)
            .orElseThrow(() -> new com.academconnect.exception.BusinessException("lote-inexistente"));
    if (lote.getEstado() == EstadoLote.CONFIRMADO) {
        throw new com.academconnect.exception.BusinessException("lote-ya-confirmado");
    }
    for (LoteImportacionItem item : lote.getItems()) {
        switch (item.getResultado()) {
            case NUEVO -> {
                Estudiante u = new Estudiante();
                u.setEmail(item.getEmail());
                u.setMatricula(item.getMatricula());
                u.setNombre(item.getNombre());
                u.setActivo(true);
                u.setEstadoCuenta(EstadoCuenta.INVITADA);
                u.setPassword(null);
                u.setLoteImportacionId(lote.getId());
                var g = usuarioRepository.save(u);
                String token = tokenService.emitir(g.getId(), PropositoToken.ACTIVACION);
                var c = templates.activacion(g.getNombre(), token);
                mailService.encolar(g.getEmail(), c.asunto(), c.html(), c.texto());
            }
            case EXISTE_INVITADA -> {
                if (req.reenviarInvitadas()) {
                    var u = usuarioRepository.findByEmail(item.getEmail()).orElseThrow();
                    String token = tokenService.emitir(u.getId(), PropositoToken.ACTIVACION);
                    var c = templates.activacion(u.getNombre(), token);
                    mailService.encolar(u.getEmail(), c.asunto(), c.html(), c.texto());
                }
            }
            default -> { /* EXISTE_ACTIVA, colisiones, errores -> skip (no merge) */ }
        }
    }
    lote.setEstado(EstadoLote.CONFIRMADO);
    eventos.publishEvent(ActividadEvent.of(TipoActividad.IMPORTACION_CONFIRMADA, adminId,
            "LOTE_IMPORTACION", lote.getId(),
            Map.of("total", lote.getTotal(), "nuevos", lote.getNuevos(),
                   "existentes", lote.getExistentes(), "errores", lote.getErrores(),
                   "archivoHash", lote.getArchivoHash()),
            VisibilidadActividad.PRIVADA, List.of()));
}
```

> Los mails encolados se drenan en oleadas por el drainer `@Scheduled`; el admin no espera el envío. Para disparo manual inmediato, exponer (opcional) un `POST /admin/importaciones/{id}/drenar` que llame `mailService.drenar()` — no requerido por el brief, omitido por YAGNI.

- [ ] **Step 5: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=ImportacionUsuariosServiceTests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/academconnect/dto/ImportConfirmRequest.java src/main/java/com/academconnect/service/ImportacionUsuariosService.java src/test/java/com/academconnect/service/ImportacionUsuariosServiceTests.java
git commit -m "feat(import): confirmar lote crea INVITADAs idempotente + encola activaciones en oleadas"
```

### Task 5.5: AdminImportacionController (multipart)

**Files:**
- Create: `controller/AdminImportacionController.java`
- Test: `src/test/java/com/academconnect/controller/AdminImportacionControllerTests.java`

- [ ] **Step 1: Test que falla (MockMultipartFile)**

```java
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
@Import(TestcontainersConfiguration.class) @Transactional
class AdminImportacionControllerTests {
    @Autowired MockMvc mockMvc;

    @Test
    @WithMockUser(roles = "ADMINISTRADOR")
    void previewYConfirmFlujoCompleto() throws Exception {
        var file = new MockMultipartFile("file", "padron.csv", "text/csv",
            "email,matricula,nombre\nz@academ.test,MZ,Z\n".getBytes());
        var res = mockMvc.perform(multipart("/admin/importaciones/preview").file(file))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.nuevos").value(1))
            .andReturn().getResponse().getContentAsString();
        Long loteId = com.jayway.jsonpath.JsonPath.parse(res).read("$.loteId", Long.class);

        mockMvc.perform(post("/admin/importaciones/" + loteId + "/confirmar")
                .contentType(MediaType.APPLICATION_JSON).content("{\"reenviarInvitadas\":false}"))
            .andExpect(status().isNoContent());
    }

    @Test
    @WithMockUser(roles = "ESTUDIANTE")
    void noAdmin403() throws Exception {
        var file = new MockMultipartFile("file", "p.csv", "text/csv", "x".getBytes());
        mockMvc.perform(multipart("/admin/importaciones/preview").file(file))
            .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 2: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=AdminImportacionControllerTests`
Expected: FAIL.

- [ ] **Step 3: Implementar controller**

```java
package com.academconnect.controller;

import com.academconnect.dto.ImportConfirmRequest;
import com.academconnect.dto.ImportPreviewResponse;
import com.academconnect.service.ImportacionUsuariosService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;

@RestController
@RequestMapping("/admin/importaciones")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMINISTRADOR')")
public class AdminImportacionController {

    private final ImportacionUsuariosService service;

    @PostMapping("/preview")
    public ImportPreviewResponse preview(@RequestParam("file") MultipartFile file,
                                         @AuthenticationPrincipal Jwt jwt) {
        try {
            return service.preview(file.getOriginalFilename(), file.getBytes(), jwt.getClaim("userId"));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @PostMapping("/{id}/confirmar")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void confirmar(@PathVariable Long id, @Valid @RequestBody ImportConfirmRequest req,
                          @AuthenticationPrincipal Jwt jwt) {
        service.confirmar(id, req, jwt.getClaim("userId"));
    }
}
```

> Usar el mismo mecanismo de extracción de `userId` que el resto de controllers admin (verificar patrón real).

- [ ] **Step 4: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=AdminImportacionControllerTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/academconnect/controller/AdminImportacionController.java src/test/java/com/academconnect/controller/AdminImportacionControllerTests.java
git commit -m "feat(admin): endpoints de importación masiva (preview multipart + confirmar)"
```

---

## Phase 6 — Retiro de endpoints legacy `/auth/register/*`

### Task 6.1: Verificar usos y quitar endpoints

**Files:**
- Modify: `controller/AuthController.java`, `service/AuthService.java`
- Modify/Delete: tests de register en `AuthControllerTests`

- [ ] **Step 1: Verificar qué usa los register DTOs/métodos**

Run: `grep -rn "register/\|registerEstudiante\|registerProfesor\|registerExterno" src/`
Expected: ver solo `AuthController`, `AuthService` y tests. (Los `*Request` siguen usados por `*Service.crear` y seeds — **no** se borran.)

- [ ] **Step 2: Quitar los 3 endpoints de AuthController**

Eliminar los métodos `registerEstudiante`, `registerProfesor`, `registerExterno` (y sus imports si quedan sin uso). Conservar `login`.

- [ ] **Step 3: Quitar los 3 métodos de AuthService**

Eliminar `registerEstudiante/Profesor/Externo` de `AuthService`. Conservar `login` y `buildResponse`.

- [ ] **Step 4: Actualizar tests**

Eliminar de `AuthControllerTests` los tests que hacen `POST /auth/register/*`. El seed que usa `estudianteService.crear(...)` se conserva (no depende del endpoint).

- [ ] **Step 5: Correr suite de auth**

Run: `./mvnw -q test -Dtest=AuthControllerTests,OnboardingControllerTests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/academconnect/controller/AuthController.java src/main/java/com/academconnect/service/AuthService.java src/test/java/com/academconnect/controller/AuthControllerTests.java
git commit -m "refactor(auth): retirar endpoints legacy /auth/register/* (reemplazados por onboarding)"
```

### Task 6.2: Suite backend completa verde

- [ ] **Step 1: Correr todo el backend**

Run: `./mvnw -q test`
Expected: BUILD SUCCESS, todos los tests verdes (incluye los nuevos de onboarding/import/mail y los preexistentes).

- [ ] **Step 2: Si algo falla, depurar antes de seguir**

Usar superpowers:systematic-debugging. No avanzar a frontend con backend rojo.

---

## Phase 7 — Frontend (Angular 21)

> Convenciones del repo (confirmadas): standalone (sin `standalone:true`), `ChangeDetectionStrategy.OnPush`, signals, `input()/output()`, reactive forms con `nonNullable`, sin `ngClass/ngStyle`, control de flujo `@if/@for`, componentes UI compartidos `Button`/`Card`/`Input`, errores vía `ProblemDetail`/`isProblemDetail`, sin servicio de toast (feedback con signals). El interceptor agrega `withCredentials`. `apiBase` en `environment`.

### Task 7.1: Modelos + OnboardingService (frontend)

**Files:**
- Create: `src/app/features/auth/onboarding.models.ts`
- Create: `src/app/features/auth/onboarding.service.ts`

- [ ] **Step 1: Modelos**

```typescript
export interface SolicitudCuentaRequest {
  matricula: string;
  email: string;
  nombre: string;
}

export type PropositoToken = 'ACTIVACION' | 'RESET';

export interface VerificarTokenResponse {
  valido: boolean;
  proposito: PropositoToken | null;
}
```

- [ ] **Step 2: Servicio**

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SolicitudCuentaRequest, VerificarTokenResponse } from './onboarding.models';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  solicitar(payload: SolicitudCuentaRequest): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.base}/auth/solicitudes`, payload);
  }

  verificarToken(token: string): Observable<VerificarTokenResponse> {
    return this.http.post<VerificarTokenResponse>(`${this.base}/auth/token/verificar`, { token });
  }

  establecerPassword(token: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/password/establecer`, { token, password });
  }

  recuperarPassword(email: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.base}/auth/password/recuperar`, { email });
  }

  reenviarActivacion(email: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.base}/auth/activacion/reenviar`, { email });
  }
}
```

- [ ] **Step 3: Verificar build/lint**

Run: `npm run lint`
Expected: sin errores en los archivos nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/auth/onboarding.models.ts src/app/features/auth/onboarding.service.ts
git commit -m "feat(web): modelos y OnboardingService"
```

### Task 7.2: Página pública "Solicitar cuenta"

**Files:**
- Create: `src/app/features/auth/solicitar-cuenta-page/solicitar-cuenta-page.ts` (+ `.html`, `.scss`)
- Modify: `src/app/features/auth/auth.routes.ts`
- Test: `src/app/features/auth/solicitar-cuenta-page/solicitar-cuenta-page.spec.ts`

- [ ] **Step 1: Componente (TS)**

```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { OnboardingService } from '../onboarding.service';

@Component({
  selector: 'ac-solicitar-cuenta-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Button, Card],
  templateUrl: './solicitar-cuenta-page.html',
  styleUrl: './solicitar-cuenta-page.scss',
})
export class SolicitarCuentaPage {
  private readonly service = inject(OnboardingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = new FormGroup({
    matricula: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(30)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
  });

  protected readonly submitting = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly done = signal(false);
  protected readonly mensaje = computed(() =>
    'Si los datos corresponden a un registro institucional, un administrador revisará tu solicitud y recibirás un enlace de activación en tu correo institucional.');

  protected submit(): void {
    this.submitAttempted.set(true);
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.submitting.set(true);
    this.service.solicitar(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.submitting.set(false); this.done.set(true); },
        // Respuesta genérica: incluso ante error mostramos el mismo mensaje (anti-enumeración).
        error: () => { this.submitting.set(false); this.done.set(true); },
      });
  }
}
```

- [ ] **Step 2: Template (HTML)**

```html
<ac-card padding="lg" elevated>
  @if (!done()) {
    <h1>Solicitar cuenta</h1>
    <p>Ingresá tu matrícula, nombre y correo institucional. Un administrador verificará que correspondan.</p>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Matrícula
        <input type="text" formControlName="matricula" autocomplete="off" />
      </label>
      @if (submitAttempted() && form.controls.matricula.invalid) { <small>Ingresá tu matrícula.</small> }
      <label>Nombre completo
        <input type="text" formControlName="nombre" />
      </label>
      @if (submitAttempted() && form.controls.nombre.invalid) { <small>Ingresá tu nombre.</small> }
      <label>Correo institucional
        <input type="email" formControlName="email" autocomplete="email" />
      </label>
      @if (submitAttempted() && form.controls.email.invalid) { <small>Ingresá un correo válido.</small> }
      <ac-button type="submit" [loading]="submitting()" [fullWidth]="true">Enviar solicitud</ac-button>
    </form>
    <a routerLink="/login">Volver a iniciar sesión</a>
  } @else {
    <h1>Solicitud enviada</h1>
    <p>{{ mensaje() }}</p>
    <a routerLink="/login">Volver a iniciar sesión</a>
  }
</ac-card>
```

(Estilos: copiar la estructura de `login-page.scss`. Usar los componentes `Input` compartidos si se prefiere consistencia visual; el ejemplo usa inputs nativos por brevedad — preferir `ac-input` si el resto de auth lo usa.)

- [ ] **Step 3: Ruta pública**

En `auth.routes.ts` agregar:

```typescript
{
  path: 'solicitar-cuenta',
  loadComponent: () => import('./solicitar-cuenta-page/solicitar-cuenta-page').then((m) => m.SolicitarCuentaPage),
  title: 'Solicitar cuenta · AcademConnect',
},
```

- [ ] **Step 4: Test (Vitest)**

```typescript
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SolicitarCuentaPage } from './solicitar-cuenta-page';
import { environment } from '../../../../environments/environment';

describe('SolicitarCuentaPage', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SolicitarCuentaPage, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('envía la solicitud y muestra confirmación genérica', () => {
    const fixture = TestBed.createComponent(SolicitarCuentaPage);
    const cmp = fixture.componentInstance as unknown as { form: any; submit: () => void; done: () => boolean };
    cmp.form.setValue({ matricula: '2024001', email: 'a@x.test', nombre: 'Ana' });
    cmp.submit();
    http.expectOne(`${environment.apiBase}/auth/solicitudes`).flush({ mensaje: 'ok' });
    expect(cmp.done()).toBe(true);
  });
});
```

- [ ] **Step 5: Correr test**

Run: `npm run test -- --run solicitar-cuenta-page`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/auth/solicitar-cuenta-page/ src/app/features/auth/auth.routes.ts
git commit -m "feat(web): página pública de solicitud de cuenta"
```

### Task 7.3: Página pública "Establecer contraseña" (activación/reset)

**Files:**
- Create: `src/app/features/auth/establecer-password-page/establecer-password-page.ts` (+ `.html`, `.scss`)
- Modify: `src/app/features/auth/auth.routes.ts`
- Test: `.spec.ts`

- [ ] **Step 1: Componente (TS)** — lee `?token=`, verifica, deja fijar contraseña

```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { OnboardingService } from '../onboarding.service';
import { PropositoToken } from '../onboarding.models';

@Component({
  selector: 'ac-establecer-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Button, Card],
  templateUrl: './establecer-password-page.html',
  styleUrl: './establecer-password-page.scss',
})
export class EstablecerPasswordPage {
  private readonly service = inject(OnboardingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
  protected readonly estado = signal<'verificando' | 'valido' | 'invalido' | 'listo'>('verificando');
  protected readonly proposito = signal<PropositoToken | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitAttempted = signal(false);

  protected readonly form = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    repetir: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    if (!this.token) { this.estado.set('invalido'); return; }
    this.service.verificarToken(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => { this.proposito.set(r.proposito); this.estado.set(r.valido ? 'valido' : 'invalido'); },
        error: () => this.estado.set('invalido'),
      });
  }

  protected submit(): void {
    this.submitAttempted.set(true);
    if (this.form.invalid || this.form.value.password !== this.form.value.repetir) {
      this.form.markAllAsTouched(); return;
    }
    this.submitting.set(true);
    this.service.establecerPassword(this.token, this.form.controls.password.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.submitting.set(false); this.estado.set('listo'); },
        error: () => { this.submitting.set(false); this.estado.set('invalido'); },
      });
  }

  protected irALogin(): void { void this.router.navigate(['/login']); }
}
```

- [ ] **Step 2: Template (HTML)**

```html
<ac-card padding="lg" elevated>
  @switch (estado()) {
    @case ('verificando') { <p>Verificando enlace…</p> }
    @case ('invalido') {
      <h1>Enlace inválido o expirado</h1>
      <p>Pedí un enlace nuevo desde la pantalla de inicio de sesión.</p>
      <a routerLink="/recuperar-password">Solicitar enlace nuevo</a>
    }
    @case ('listo') {
      <h1>¡Listo!</h1>
      <p>Tu contraseña quedó configurada. Ya podés iniciar sesión.</p>
      <ac-button (click)="irALogin()">Iniciar sesión</ac-button>
    }
    @default {
      <h1>{{ proposito() === 'RESET' ? 'Restablecer contraseña' : 'Activar cuenta' }}</h1>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <label>Nueva contraseña
          <input type="password" formControlName="password" autocomplete="new-password" />
        </label>
        @if (submitAttempted() && form.controls.password.invalid) { <small>Mínimo 8 caracteres.</small> }
        <label>Repetir contraseña
          <input type="password" formControlName="repetir" autocomplete="new-password" />
        </label>
        @if (submitAttempted() && form.value.password !== form.value.repetir) { <small>Las contraseñas no coinciden.</small> }
        <ac-button type="submit" [loading]="submitting()" [fullWidth]="true">Guardar contraseña</ac-button>
      </form>
    }
  }
</ac-card>
```

- [ ] **Step 3: Ruta pública**

```typescript
{
  path: 'establecer-password',
  loadComponent: () => import('./establecer-password-page/establecer-password-page').then((m) => m.EstablecerPasswordPage),
  title: 'Establecer contraseña · AcademConnect',
},
```

- [ ] **Step 4: Test (verifica token al iniciar)**

```typescript
it('verifica el token y habilita el formulario cuando es válido', () => {
  TestBed.configureTestingModule({
    imports: [EstablecerPasswordPage, HttpClientTestingModule],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map([['token', 'abc']]) } } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(EstablecerPasswordPage);
  fixture.detectChanges();
  http.expectOne(`${environment.apiBase}/auth/token/verificar`).flush({ valido: true, proposito: 'ACTIVACION' });
  const cmp = fixture.componentInstance as unknown as { estado: () => string };
  expect(cmp.estado()).toBe('valido');
});
```

(El `ActivatedRoute` mock debe exponer `queryParamMap.get('token')`; usar un objeto con `get` si `Map` no encaja con el tipo — ajustar al helper que el repo use para tests de rutas.)

- [ ] **Step 5: Correr test**

Run: `npm run test -- --run establecer-password-page`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/auth/establecer-password-page/ src/app/features/auth/auth.routes.ts
git commit -m "feat(web): página de activación/restablecimiento de contraseña por token"
```

### Task 7.4: Página pública "Recuperar contraseña" + habilitar link en login

**Files:**
- Create: `src/app/features/auth/recuperar-password-page/recuperar-password-page.ts` (+ `.html`, `.scss`)
- Modify: `src/app/features/auth/auth.routes.ts`, `src/app/features/auth/login-page/login-page.html`

- [ ] **Step 1: Componente (TS)** — un email, respuesta genérica

```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { OnboardingService } from '../onboarding.service';

@Component({
  selector: 'ac-recuperar-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Button, Card],
  templateUrl: './recuperar-password-page.html',
  styleUrl: './recuperar-password-page.scss',
})
export class RecuperarPasswordPage {
  private readonly service = inject(OnboardingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly email = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] });
  protected readonly submitting = signal(false);
  protected readonly done = signal(false);

  protected submit(): void {
    if (this.email.invalid) { this.email.markAsTouched(); return; }
    this.submitting.set(true);
    this.service.recuperarPassword(this.email.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.submitting.set(false); this.done.set(true); },
        error: () => { this.submitting.set(false); this.done.set(true); },
      });
  }
}
```

- [ ] **Step 2: Template (HTML)**

```html
<ac-card padding="lg" elevated>
  @if (!done()) {
    <h1>Recuperar contraseña</h1>
    <p>Ingresá tu correo institucional. Si corresponde, te enviaremos un enlace.</p>
    <form (ngSubmit)="submit()">
      <label>Correo
        <input type="email" [formControl]="email" autocomplete="email" />
      </label>
      <ac-button type="submit" [loading]="submitting()" [fullWidth]="true">Enviar enlace</ac-button>
    </form>
    <a routerLink="/login">Volver</a>
  } @else {
    <h1>Revisá tu correo</h1>
    <p>Si corresponde, enviamos un enlace al correo indicado.</p>
    <a routerLink="/login">Volver a iniciar sesión</a>
  }
</ac-card>
```

- [ ] **Step 3: Ruta + habilitar link en login**

Ruta:
```typescript
{
  path: 'recuperar-password',
  loadComponent: () => import('./recuperar-password-page/recuperar-password-page').then((m) => m.RecuperarPasswordPage),
  title: 'Recuperar contraseña · AcademConnect',
},
```

En `login-page.html`, reemplazar el link deshabilitado por uno activo a `/solicitar-cuenta` y añadir el de recuperación:

```html
<a class="login__footer-link" routerLink="/solicitar-cuenta">Solicitar cuenta</a>
<a class="login__footer-link" routerLink="/recuperar-password">Olvidé mi contraseña</a>
```

(Asegurar que `LoginPage` importe `RouterLink` si aún no lo hace.)

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build OK (rutas lazy resuelven).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/auth/recuperar-password-page/ src/app/features/auth/auth.routes.ts src/app/features/auth/login-page/login-page.html src/app/features/auth/login-page/login-page.ts
git commit -m "feat(web): recuperar contraseña + habilitar enlaces en login"
```

### Task 7.5: Admin — extender admin.service + modelos

**Files:**
- Modify: `src/app/features/admin/admin.service.ts`, `src/app/features/admin/admin.models.ts`

- [ ] **Step 1: Modelos**

```typescript
export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export interface SolicitudCuenta {
  id: number;
  matricula: string;
  email: string;
  nombre: string;
  estado: EstadoSolicitud;
  motivoRechazo: string | null;
  createdAt: string;
}

export type ResultadoFila =
  | 'NUEVO' | 'EXISTE_ACTIVA' | 'EXISTE_INVITADA'
  | 'COLISION_EMAIL' | 'COLISION_MATRICULA' | 'ERROR_FORMATO';

export interface ImportItem {
  linea: number; matricula: string | null; email: string | null; nombre: string | null;
  resultado: ResultadoFila; detalle: string | null;
}

export interface ImportPreview {
  loteId: number; total: number; nuevos: number; existentes: number; errores: number; items: ImportItem[];
}
```

- [ ] **Step 2: Métodos en admin.service.ts**

```typescript
buscarSolicitudes(p: { estado?: EstadoSolicitud | ''; q?: string; page: number; size: number }): Observable<Page<SolicitudCuenta>> {
  let params = new HttpParams().set('page', p.page).set('size', p.size);
  if (p.estado) params = params.set('estado', p.estado);
  if (p.q) params = params.set('q', p.q);
  return this.http.get<Page<SolicitudCuenta>>(`${this.base}/admin/solicitudes`, { params });
}
aprobarSolicitud(id: number): Observable<SolicitudCuenta> {
  return this.http.post<SolicitudCuenta>(`${this.base}/admin/solicitudes/${id}/aprobar`, {});
}
rechazarSolicitud(id: number, motivo: string): Observable<SolicitudCuenta> {
  return this.http.post<SolicitudCuenta>(`${this.base}/admin/solicitudes/${id}/rechazar`, { motivo });
}
previewImportacion(file: File): Observable<ImportPreview> {
  const fd = new FormData(); fd.append('file', file);
  return this.http.post<ImportPreview>(`${this.base}/admin/importaciones/preview`, fd);
}
confirmarImportacion(loteId: number, reenviarInvitadas: boolean): Observable<void> {
  return this.http.post<void>(`${this.base}/admin/importaciones/${loteId}/confirmar`, { reenviarInvitadas });
}
```

(Usar el mismo `this.base`/`HttpParams`/imports que ya tiene `admin.service.ts`.)

- [ ] **Step 3: Verificar lint/build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/admin/admin.service.ts src/app/features/admin/admin.models.ts
git commit -m "feat(web): admin.service para solicitudes e importación"
```

### Task 7.6: Admin — página de cola de solicitudes

**Files:**
- Create: `src/app/features/admin/solicitudes-page/solicitudes-page.ts` (+ `.html`, `.scss`)
- Modify: `src/app/features/admin/admin.routes.ts`

- [ ] **Step 1: Componente (TS)** — replica el patrón de `usuarios-page` (paginación server-side + filtro + acciones)

```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Button } from '../../../shared/ui/button/button';
import { AdminService } from '../admin.service';
import { EstadoSolicitud, SolicitudCuenta } from '../admin.models';

const PAGE_SIZE = 10;

@Component({
  selector: 'ac-solicitudes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button],
  templateUrl: './solicitudes-page.html',
  styleUrl: './solicitudes-page.scss',
})
export class SolicitudesPage {
  private readonly service = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly solicitudes = signal<SolicitudCuenta[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly actionId = signal<number | null>(null);
  protected readonly page = signal(0);
  protected readonly first = signal(true);
  protected readonly last = signal(true);
  protected readonly totalElements = signal(0);

  protected readonly buscador = new FormControl('', { nonNullable: true });
  protected readonly filtroEstado = new FormControl<EstadoSolicitud | ''>('PENDIENTE', { nonNullable: true });

  constructor() {
    this.buscador.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.page.set(0); this.cargar(); });
    this.filtroEstado.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.page.set(0); this.cargar(); });
    this.cargar();
  }

  private cargar(): void {
    this.loading.set(true); this.error.set(null);
    this.service.buscarSolicitudes({
      estado: this.filtroEstado.value, q: this.buscador.value, page: this.page(), size: PAGE_SIZE,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => {
        this.solicitudes.set(p.content); this.first.set(p.first); this.last.set(p.last);
        this.totalElements.set(p.totalElements); this.page.set(p.number); this.loading.set(false);
      },
      error: () => { this.error.set('No se pudieron cargar las solicitudes.'); this.loading.set(false); },
    });
  }

  protected aprobar(s: SolicitudCuenta): void {
    this.actionId.set(s.id);
    this.service.aprobarSolicitud(s.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.actionId.set(null); this.cargar(); },
      error: () => { this.error.set('No se pudo aprobar (¿conflicto de identidad?).'); this.actionId.set(null); },
    });
  }

  protected rechazar(s: SolicitudCuenta): void {
    const motivo = (globalThis.prompt('Motivo del rechazo:') ?? '').trim();
    if (!motivo) return;
    this.actionId.set(s.id);
    this.service.rechazarSolicitud(s.id, motivo).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.actionId.set(null); this.cargar(); },
      error: () => { this.error.set('No se pudo rechazar.'); this.actionId.set(null); },
    });
  }

  protected anterior(): void { if (this.first() || this.loading()) return; this.page.update((p) => p - 1); this.cargar(); }
  protected siguiente(): void { if (this.last() || this.loading()) return; this.page.update((p) => p + 1); this.cargar(); }
}
```

> El `prompt` para el motivo es un placeholder funcional minimalista coherente con "sin servicio de toast/modal" del repo. Si el repo ya tiene un componente modal, usarlo en vez de `prompt`. **Verificar** antes de implementar.

- [ ] **Step 2: Template (HTML)** — tabla + filtro + paginación (espejo de `usuarios-page.html`)

```html
<header>
  <h1>Solicitudes de cuenta</h1>
  <p>{{ totalElements() }} solicitudes</p>
</header>

<div class="filtros">
  <input type="search" [formControl]="buscador" placeholder="Buscar por nombre, email o matrícula" />
  <select [formControl]="filtroEstado">
    <option value="PENDIENTE">Pendientes</option>
    <option value="APROBADA">Aprobadas</option>
    <option value="RECHAZADA">Rechazadas</option>
    <option value="">Todas</option>
  </select>
</div>

@if (error()) { <p role="alert">{{ error() }}</p> }
@if (loading()) { <p>Cargando…</p> }

<table>
  <thead>
    <tr><th>Matrícula</th><th>Nombre</th><th>Email</th><th>Estado</th><th>Acciones</th></tr>
  </thead>
  <tbody>
    @for (s of solicitudes(); track s.id) {
      <tr>
        <td>{{ s.matricula }}</td>
        <td>{{ s.nombre }}</td>
        <td>{{ s.email }}</td>
        <td>{{ s.estado }}</td>
        <td>
          @if (s.estado === 'PENDIENTE') {
            <ac-button size="sm" [loading]="actionId() === s.id" (click)="aprobar(s)">Aprobar</ac-button>
            <ac-button size="sm" variant="ghost" (click)="rechazar(s)">Rechazar</ac-button>
          } @else if (s.estado === 'RECHAZADA') {
            <span>{{ s.motivoRechazo }}</span>
          }
        </td>
      </tr>
    } @empty {
      <tr><td colspan="5">No hay solicitudes.</td></tr>
    }
  </tbody>
</table>

<nav class="paginacion">
  <ac-button size="sm" variant="ghost" [disabled]="first()" (click)="anterior()">Anterior</ac-button>
  <ac-button size="sm" variant="ghost" [disabled]="last()" (click)="siguiente()">Siguiente</ac-button>
</nav>
```

- [ ] **Step 3: Ruta admin**

En `admin.routes.ts`:

```typescript
{
  path: 'admin/solicitudes',
  canActivate: [authGuard, roleGuard],
  data: { roles: ['ADMINISTRADOR'] },
  loadComponent: () => import('./solicitudes-page/solicitudes-page').then((m) => m.SolicitudesPage),
  title: 'Solicitudes de cuenta · AcademConnect',
},
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/admin/solicitudes-page/ src/app/features/admin/admin.routes.ts
git commit -m "feat(web): página admin de cola de solicitudes (aprobar/rechazar)"
```

### Task 7.7: Admin — página de importación masiva (preview → confirmar)

**Files:**
- Create: `src/app/features/admin/importar-usuarios-page/importar-usuarios-page.ts` (+ `.html`, `.scss`)
- Modify: `src/app/features/admin/admin.routes.ts`

- [ ] **Step 1: Componente (TS)**

```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { AdminService } from '../admin.service';
import { ImportPreview } from '../admin.models';

@Component({
  selector: 'ac-importar-usuarios-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card],
  templateUrl: './importar-usuarios-page.html',
  styleUrl: './importar-usuarios-page.scss',
})
export class ImportarUsuariosPage {
  private readonly service = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly archivo = signal<File | null>(null);
  protected readonly preview = signal<ImportPreview | null>(null);
  protected readonly cargando = signal(false);
  protected readonly confirmando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmado = signal(false);
  protected readonly reenviarInvitadas = signal(false);

  protected onArchivo(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.archivo.set(input.files?.[0] ?? null);
    this.preview.set(null); this.confirmado.set(false); this.error.set(null);
  }

  protected previsualizar(): void {
    const f = this.archivo();
    if (!f) return;
    this.cargando.set(true); this.error.set(null);
    this.service.previewImportacion(f).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => { this.preview.set(p); this.cargando.set(false); },
      error: () => { this.error.set('No se pudo procesar el archivo (formato CSV: email,matricula,nombre).'); this.cargando.set(false); },
    });
  }

  protected confirmar(): void {
    const p = this.preview();
    if (!p) return;
    this.confirmando.set(true); this.error.set(null);
    this.service.confirmarImportacion(p.loteId, this.reenviarInvitadas())
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => { this.confirmando.set(false); this.confirmado.set(true); },
        error: () => { this.error.set('No se pudo confirmar la importación.'); this.confirmando.set(false); },
      });
  }
}
```

- [ ] **Step 2: Template (HTML)** — dry-run con resumen "N nuevos · M existen · K errores"

```html
<ac-card padding="lg">
  <h1>Importar estudiantes (padrón)</h1>
  <p>Archivo CSV con encabezado <code>email,matricula,nombre</code>. Solo crea estudiantes en estado INVITADA.</p>

  <input type="file" accept=".csv,text/csv" (change)="onArchivo($event)" />
  <ac-button [disabled]="!archivo() || cargando()" [loading]="cargando()" (click)="previsualizar()">Previsualizar</ac-button>

  @if (error()) { <p role="alert">{{ error() }}</p> }

  @if (preview(); as p) {
    <p><strong>{{ p.nuevos }}</strong> nuevos · <strong>{{ p.existentes }}</strong> ya existen · <strong>{{ p.errores }}</strong> errores (total {{ p.total }})</p>
    <table>
      <thead><tr><th>Línea</th><th>Matrícula</th><th>Email</th><th>Resultado</th><th>Detalle</th></tr></thead>
      <tbody>
        @for (it of p.items; track it.linea) {
          <tr>
            <td>{{ it.linea }}</td><td>{{ it.matricula }}</td><td>{{ it.email }}</td>
            <td>{{ it.resultado }}</td><td>{{ it.detalle }}</td>
          </tr>
        }
      </tbody>
    </table>

    @if (!confirmado()) {
      <label>
        <input type="checkbox" [checked]="reenviarInvitadas()" (change)="reenviarInvitadas.set(!reenviarInvitadas())" />
        Reenviar activación a cuentas ya invitadas
      </label>
      <ac-button [loading]="confirmando()" (click)="confirmar()">Confirmar importación ({{ p.nuevos }} nuevos)</ac-button>
    } @else {
      <p>Importación confirmada. Los correos de activación se envían en oleadas.</p>
    }
  }
</ac-card>
```

- [ ] **Step 3: Ruta admin**

```typescript
{
  path: 'admin/importar-usuarios',
  canActivate: [authGuard, roleGuard],
  data: { roles: ['ADMINISTRADOR'] },
  loadComponent: () => import('./importar-usuarios-page/importar-usuarios-page').then((m) => m.ImportarUsuariosPage),
  title: 'Importar usuarios · AcademConnect',
},
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/admin/importar-usuarios-page/ src/app/features/admin/admin.routes.ts
git commit -m "feat(web): página admin de importación masiva (preview/confirmar)"
```

### Task 7.8: Enlaces de navegación admin + verificación frontend completa

**Files:**
- Modify: el dashboard/menú admin (p. ej. `admin-dashboard-page` o el shell) para enlazar las nuevas páginas.

- [ ] **Step 1: Agregar enlaces**

En la página/menú admin existente (`admin-dashboard-page`), agregar `routerLink` a `/admin/solicitudes` y `/admin/importar-usuarios` siguiendo el patrón de los tiles/links ya presentes (usuarios, áreas, auditoría, moderar). **Verificar** el componente real y copiar su estructura de tile.

- [ ] **Step 2: Suite frontend completa**

Run: `npm run test -- --run` y `npm run build` y `npm run lint`
Expected: todo verde.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/admin/admin-dashboard-page/
git commit -m "feat(web): enlaces admin a solicitudes e importación"
```

---

## Phase 8 — Purga de PII + cierre de auditoría

### Task 8.1: Job de purga (solicitudes 7d, lotes PREVIEW 24h)

**Files:**
- Create: `service/PurgaSolicitudesJob.java`
- Test: `src/test/java/com/academconnect/service/PurgaSolicitudesJobTests.java`

- [ ] **Step 1: Test que falla (queries reales)**

```java
@SpringBootTest @ActiveProfiles("test") @Import(TestcontainersConfiguration.class)
class PurgaSolicitudesJobTests {
    @Autowired PurgaSolicitudesJob job;
    @Autowired SolicitudCuentaRepository repo;

    @Test
    @org.springframework.transaction.annotation.Transactional
    void purgaSolicitudesRechazadasMayoresA7Dias() {
        var s = new SolicitudCuenta();
        s.setMatricula("M"); s.setEmail("x@x.test"); s.setNombre("X");
        s.setEstado(EstadoSolicitud.RECHAZADA);
        var guardada = repo.save(s);
        // forzar updatedAt > 7 días vía query nativa o reflejarlo en el repositorio de test
        repo.flush();
        job.purgar(java.time.OffsetDateTime.now().plusDays(8)); // referencia futura simula 8 días después
        assertThat(repo.findById(guardada.getId())).isEmpty();
    }
}
```

> El job debe aceptar el "ahora" como parámetro para ser testeable de forma determinista (el método `@Scheduled` llama al de parámetro con `OffsetDateTime.now()`).

- [ ] **Step 2: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=PurgaSolicitudesJobTests`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```java
package com.academconnect.service;

import com.academconnect.domain.EstadoLote;
import com.academconnect.domain.EstadoSolicitud;
import com.academconnect.repository.LoteImportacionRepository;
import com.academconnect.repository.SolicitudCuentaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PurgaSolicitudesJob {

    private final SolicitudCuentaRepository solicitudRepository;
    private final LoteImportacionRepository loteRepository;

    @Scheduled(cron = "${academconnect.onboarding.purga-cron:0 0 3 * * *}")
    @Transactional
    public void purgarProgramado() {
        purgar(OffsetDateTime.now());
    }

    /** El metadato de decisión persiste en `actividad` (sin PII); aquí solo se borra la PII de la solicitud. */
    @Transactional
    public void purgar(OffsetDateTime ahora) {
        var solicitudes = solicitudRepository.findByEstadoInAndUpdatedAtBefore(
                List.of(EstadoSolicitud.PENDIENTE, EstadoSolicitud.RECHAZADA), ahora.minusDays(7));
        solicitudRepository.deleteAll(solicitudes);

        var lotes = loteRepository.findByEstadoAndCreatedAtBefore(EstadoLote.PREVIEW, ahora.minusHours(24));
        loteRepository.deleteAll(lotes); // items por ON DELETE CASCADE
    }
}
```

> Confirmar el tipo temporal de `BaseEntity.updatedAt`/`createdAt` y alinear las firmas de repo. Agregar la propiedad `academconnect.onboarding.purga-cron` si se desea override.

- [ ] **Step 4: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=PurgaSolicitudesJobTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/academconnect/service/PurgaSolicitudesJob.java src/test/java/com/academconnect/service/PurgaSolicitudesJobTests.java
git commit -m "feat(onboarding): job de purga de PII (solicitudes 7d, lotes PREVIEW 24h)"
```

### Task 8.2: Evento CUENTA_ACTIVADA al establecer contraseña

**Files:**
- Modify: `service/OnboardingService.java` (en `establecerPassword`)
- Test: extender `OnboardingControllerTests` o un test de servicio

- [ ] **Step 1: Test que falla**

Verificar que tras activar se persiste una `Actividad` `CUENTA_ACTIVADA` (consultar `ActividadRepository` por `recursoId = usuarioId`). Como el listener es `@Async`, en test usar `await`/`Awaitility` o invocar el publisher de forma síncrona en perfil test. Patrón mínimo: testear que `establecerPassword` llama al publisher (test de servicio con un `@MockBean ApplicationEventPublisher` y `verify`).

```java
@Test
void establecerPasswordPublicaCuentaActivada() {
    // arrange: cuenta INVITADA + token ACTIVACION (como en TokenCuentaServiceTests)
    // act: onboardingService.establecerPassword(token, "NuevaPass123")
    // assert: verify(eventos).publishEvent(argThat(e -> ((ActividadEvent)e).tipo()==TipoActividad.CUENTA_ACTIVADA))
}
```

- [ ] **Step 2: Correr y ver fallar**

Run: `./mvnw -q test -Dtest=OnboardingServiceEventosTests`
Expected: FAIL.

- [ ] **Step 3: Implementar — publicar evento en establecerPassword**

Al final de `establecerPassword`, tras `usuarioRepository.save(u)`:

```java
TipoActividad tipo = proposito == PropositoToken.ACTIVACION
        ? TipoActividad.CUENTA_ACTIVADA : TipoActividad.PASSWORD_RESTABLECIDA;
eventos.publishEvent(ActividadEvent.of(tipo, u.getId(), "USUARIO", u.getId(),
        java.util.Map.of("matricula", u.getMatricula() == null ? "" : u.getMatricula()),
        VisibilidadActividad.PRIVADA, java.util.List.of()));
```

- [ ] **Step 4: Correr y ver pasar**

Run: `./mvnw -q test -Dtest=OnboardingServiceEventosTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/academconnect/service/OnboardingService.java src/test/java/com/academconnect/service/OnboardingServiceEventosTests.java
git commit -m "feat(actividad): eventos CUENTA_ACTIVADA/PASSWORD_RESTABLECIDA al establecer contraseña"
```

### Task 8.3: Verificación final integral

- [ ] **Step 1: Backend completo**

Run: `./mvnw -q test` (en `../academconnect`)
Expected: BUILD SUCCESS.

- [ ] **Step 2: Frontend completo**

Run: `npm run test -- --run && npm run build && npm run lint`
Expected: todo verde.

- [ ] **Step 3: Smoke manual (opcional, recomendado)**

Levantar backend + Mailpit (`docker run -p 1025:1025 -p 8025:8025 axllent/mailpit`) + `npm start`. Flujo: solicitar cuenta → aprobar en `/admin/solicitudes` → abrir mail en Mailpit (`:8025`) → seguir enlace `/establecer-password?token=` → fijar contraseña → login. Repetir con importación CSV.

---

## Self-Review (chequeo contra el brief)

**Cobertura de las 8 preguntas abiertas:**
1. Modelo de datos → Q1 + Tasks 1.1–1.2, 1.4–1.5, 2.1–2.2, 3.2, 5.1–5.2. `estadoCuenta` nuevo, ortogonal a `activo`; password nullable con invariante. ✓
2. Endpoints + `@PreAuthorize` → Q2 + Tasks 1.7–1.8, 3.4–3.6, 4.1–4.2, 5.5. ✓
3. Casos de error / respuestas genéricas / rate-limit → Q3 + Tasks 1.7, 3.1, 3.4–3.5. ✓
4. Unificación activación/reset → Q4 + Tasks 1.6–1.7, 3.5, 4.2 (una primitiva `TokenCuenta` + `/auth/password/establecer`). ✓
5. Plantillas de mail + oleadas → Q5 + Tasks 2.1–2.4. ✓
6. Retiro legacy `/auth/register/*` → Q6 + Task 6.1. ✓
7. Migración → Q7 + Tasks 1.1, 1.4, 2.1, 3.2, 5.1 (V20–V24). ✓
8. Feed de actividad → Q8 + Tasks 3.3, 3.6, 4.2, 5.4, 8.2. ✓
- Retención de PII (7d) → Task 8.1. ✓
- Bulk: preview/dry-run, idempotencia, colisiones como error duro, rol acotado a ESTUDIANTE, oleadas, auditoría del lote (hash) → Tasks 5.3–5.5. ✓
- Anti-enumeración en self-request y auth → Tasks 3.4–3.5, 7.2, 7.4. ✓

**Consistencia de tipos:** `TokenCuentaService.emitir/consumir/propositoSiUsable`, `OnboardingService.establecerPassword/crearSolicitud/solicitarReset/reenviarActivacion/aprobar/rechazar/buscar`, `MailService.encolar/drenar`, `ImportacionUsuariosService.preview/confirmar` — nombres usados de forma idéntica en controllers y tests a lo largo del plan. Front: `OnboardingService` y `AdminService` coinciden con los endpoints backend.

**Riesgos / verificaciones pendientes marcadas inline (no asumir, confirmar en el repo real):**
- Tipo temporal de `BaseEntity` (`Instant` vs `OffsetDateTime`) — alinear todas las entidades nuevas y firmas de repo.
- Clase/handler de excepción de negocio y mapeo a `400/409/429` en el `@ControllerAdvice` existente.
- Mecanismo exacto para obtener `userId` del autenticado en controllers admin (el report mostró `Authentication authn` en `AdminUsuarioController`).
- `UsuarioRepository`: existencia de `findByMatricula`, `existsByMatricula` (agregar si faltan).
- El test unitario viejo de `AdminUsuarioServiceTests` que verificaba encode de password debe actualizarse (Task 4.1).
- Numeración Flyway: RESUELTA — migraciones numeradas por orden de creación/despliegue (V20 estado, V21 token, V22 mail, V23 solicitud, V24 lote).
- Componente modal real del front (si existe) en vez de `prompt` para el motivo de rechazo.

---

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-06-23-solicitud-de-cuenta-y-onboarding.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendada)** — despacho un subagente fresco por tarea, reviso entre tareas, iteración rápida. Útil acá por la cantidad de tareas y el cruce de dos repos.

**2. Inline Execution** — ejecuto las tareas en esta sesión con checkpoints por fase.

¿Cuál preferís? (Sugerencia: empezar por Phases 0–1 inline para validar el terreno backend, y pasar a subagent-driven desde Phase 2.)





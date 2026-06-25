# Gini — balanceo de carga en los recomendadores (#5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El coeficiente de Gini de la distribución de cargas modula dinámicamente el peso del término de carga en ambos recomendadores (más desbalance → más peso a descargar).

**Architecture:** Cambio acotado a un solo archivo backend (`RecomendadorService`): helper `gini(...)`, peso de carga interpolado con el Gini (`f = wmin + (wmax−wmin)·g`), aplicado en `puntuar` (evaluadores, preservando `w3·disponibilidad`) y `puntuarOrientador` (orientadores). El `gini` se expone en el JSON `factores` de evaluadores. No cambia afinidad, pool ni persistencia (solo enriquece `factores`).

**Tech Stack:** Backend Spring Boot/Java (Mockito/JUnit5) en `/home/ignacio/Projects/academconnect`. Sin cambios de frontend.

## Global Constraints

- Repo backend: `/home/ignacio/Projects/academconnect`. `git` con `git -C`.
- Commits directos a `main`. **NO** trailer `Co-Authored-By`. **NO** push.
- `git add` con rutas explícitas (hay archivos sin trackear no relacionados — no incluirlos).
- Pesos base existentes (no se tocan sus defaults): evaluadores `w1=0.6,w2=0.3,w3=0.1` (`w1+w2+w3=1`); orientadores `wo1=0.7,wo2=0.3` (`wo1+wo2=1`).
- Parámetros nuevos `@Value`: `academconnect.algoritmo.carga.wmin` (default 0.2), `academconnect.algoritmo.carga.wmax` (default 0.6).
- Fórmula de Gini: `G = Σ_i Σ_j |x_i − x_j| / (2·n²·μ)`; `gini=0` si `n≤1` o `μ==0`; acotado a `[0,1]`.
- Modulación: `f = wmin + (wmax−wmin)·g`. Evaluadores: bloque afinidad+carga = `w1+w2`, `wCargaEff=(w1+w2)·f`, `wAfinEff=(w1+w2)−wCargaEff`, `disponibilidad` mantiene `w3`. Orientadores: `wCargaEff=f`, `wAfinEff=1−f`. El total sigue sumando 1.
- El `gini` se calcula UNA vez por corrida y se pasa al método de puntuación.

**Spec:** `docs/superpowers/specs/2026-06-25-gini-balanceo-carga-design.md`

---

## Task 1: Helper `gini` + modulación en evaluadores (TDD)

**Files:**
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/service/RecomendadorService.java`
- Test: `/home/ignacio/Projects/academconnect/src/test/java/com/academconnect/service/RecomendadorServiceTests.java`

**Interfaces:**
- Produces: `private double gini(java.util.Collection<Long> cargas)`; campos `@Value` `wmin`/`wmax`; `puntuar(...)` ahora recibe el `gini` y modula el peso de carga; `CandidatoScore` gana `gini`; `factoresJson` incluye `gini`/`w_afin_eff`/`w_carga_eff`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir los pesos `wmin`/`wmax` al `setup()` existente de `RecomendadorServiceTests` (junto a los `ReflectionTestUtils.setField` de `w1/w2/w3`/`wo1/wo2`):

```java
        ReflectionTestUtils.setField(service, "wmin", 0.2);
        ReflectionTestUtils.setField(service, "wmax", 0.6);
```

Agregar estos tests al final de la clase:

```java
    @Test
    void gini_distribucionUniformeEsCero() {
        Assertions.assertEquals(0.0, invocarGini(java.util.List.of(3L, 3L, 3L)), 1e-9);
    }

    @Test
    void gini_listaVaciaOUnSoloEsCero() {
        Assertions.assertEquals(0.0, invocarGini(java.util.List.of()), 1e-9);
        Assertions.assertEquals(0.0, invocarGini(java.util.List.of(5L)), 1e-9);
    }

    @Test
    void gini_todasCeroEsCero() {
        Assertions.assertEquals(0.0, invocarGini(java.util.List.of(0L, 0L, 0L)), 1e-9);
    }

    @Test
    void gini_valorConocido() {
        // [0,0,4]: media=4/3; ΣΣ|xi-xj| = pares (0,0)=0, (0,4)=4 x4, = 16; 2*n^2*mu = 2*9*(4/3)=24
        // G = 16/24 = 0.6667
        Assertions.assertEquals(16.0 / 24.0, invocarGini(java.util.List.of(0L, 0L, 4L)), 1e-9);
    }

    @Test
    void sugerirRevisores_giniDesbalanceadoSubeElPesoDeCarga() {
        // profesor1 y profesor2 con MISMA afinidad (ambos comparten area1+area2),
        // cargas muy desbalanceadas → con Gini alto, el de menor carga debe ir primero.
        Mockito.when(trabajoRepository.findById(trabajoId)).thenReturn(Optional.of(trabajoConAreas));
        Mockito.when(profesorRepository.findByActivo(true)).thenReturn(List.of(profesor1, profesor2));
        Mockito.when(externoRepository.findByActivo(true)).thenReturn(List.of());
        Mockito.when(uatRepository.findByIdUsuarioId(Mockito.anyLong()))
                .thenReturn(List.of(uat(profesor1, area1), uat(profesor1, area2)));
        Mockito.when(conflictoRepository.existsByTrabajoIdAndEvaluadorId(Mockito.anyLong(), Mockito.anyLong()))
                .thenReturn(false);
        Mockito.when(asignacionRepository.countByEvaluadorIdAndEstado(
                Mockito.eq(profesor1.getId()), Mockito.any())).thenReturn(10L);
        Mockito.when(asignacionRepository.countByEvaluadorIdAndEstado(
                Mockito.eq(profesor2.getId()), Mockito.any())).thenReturn(0L);

        var res = service.sugerirRevisores(trabajoId, 2);

        Assertions.assertEquals(profesor2.getId(), res.get(0).evaluadorId()); // menor carga primero
    }
```

Agregar dos helpers al final de la clase de test (el `uat(...)` puede ya existir de tests previos; si existe, NO lo dupliques):

```java
    private double invocarGini(java.util.Collection<Long> cargas) {
        return (double) ReflectionTestUtils.invokeMethod(service, "gini", cargas);
    }

    // Si NO existe ya en la clase:
    private com.academconnect.domain.UsuarioAreaTematica uat(
            com.academconnect.domain.Usuario u, com.academconnect.domain.AreaTematica area) {
        return new com.academconnect.domain.UsuarioAreaTematica(
                u, area, com.academconnect.domain.NivelExperticia.MEDIO);
    }
```

> Verificá los fixtures reales del test (`trabajoConAreas`, `profesor1/2`, `area1/2`, `conflictoRepository`, `externoRepository`, `asignacionRepository`) — la clase ya los tiene del feature de recomendador. Ajustá nombres si difieren. `NivelExperticia.MEDIO` es el valor real del enum (BAJO/MEDIO/ALTO).
>
> `sugerirRevisores` PERSISTE recomendaciones (`recomendacionRepository.findByTrabajoIdOrderByScoreDesc` → `deleteAll` → `saveAll`). Mirá cómo los tests existentes de `sugerirRevisores` stubean `recomendacionRepository` (probablemente `findByTrabajoIdOrderByScoreDesc(...)` → `List.of()` para que `deleteAll` no reciba null) y replicá esos stubs en el test nuevo para evitar NPE. Si no hay un test previo de `sugerirRevisores` del cual copiar, agregá `Mockito.when(recomendacionRepository.findByTrabajoIdOrderByScoreDesc(Mockito.anyLong())).thenReturn(List.of());` al setup.

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=RecomendadorServiceTests`
Expected: FALLA — `gini` no existe / `puntuar` no modula / `wmin`/`wmax` no son campos.

- [ ] **Step 3: Implementar gini + pesos + modulación en evaluadores**

En `RecomendadorService.java`:

(a) Agregar los `@Value` junto a los existentes (`w1/w2/w3`, `wo1/wo2`):

```java
    @Value("${academconnect.algoritmo.carga.wmin:0.2}")
    private double wmin;

    @Value("${academconnect.algoritmo.carga.wmax:0.6}")
    private double wmax;
```

(b) Agregar el helper `gini` (cerca de `jaccard`):

```java
    /** Coeficiente de Gini de la distribución de cargas (0 = balanceado, →1 = desbalanceado). */
    private double gini(java.util.Collection<Long> cargas) {
        int n = cargas.size();
        if (n <= 1) return 0.0;
        long suma = 0L;
        for (long x : cargas) suma += x;
        if (suma == 0L) return 0.0;
        double mu = (double) suma / n;
        long sumaDiferencias = 0L;
        var lista = new java.util.ArrayList<>(cargas);
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                sumaDiferencias += Math.abs(lista.get(i) - lista.get(j));
            }
        }
        double g = sumaDiferencias / (2.0 * n * n * mu);
        return Math.max(0.0, Math.min(1.0, g));
    }
```

(c) En `sugerirRevisores`, calcular el gini una vez (después de tener `cargas` y `maxCarga`, antes del `.map(...puntuar...)`) y pasarlo a `puntuar`. La llamada actual es
`.map(c -> puntuar(c, areasTrabajoIds, cargas.get(c.getId()), maxCarga))`. Cambiarla por:

```java
        double g = gini(cargas.values());

        List<CandidatoScore> scored = candidatos.stream()
                .map(c -> puntuar(c, areasTrabajoIds, cargas.get(c.getId()), maxCarga, g))
                .sorted(Comparator.comparingDouble(CandidatoScore::score).reversed())
                .limit(k)
                .toList();
```

(d) Reemplazar el método `puntuar` por:

```java
    private CandidatoScore puntuar(
            Usuario candidato,
            Set<Long> areasTrabajoIds,
            long cargaAbsoluta,
            long maxCarga,
            double gini) {

        Set<Long> areasEval = uatRepository.findByIdUsuarioId(candidato.getId()).stream()
                .map(uat -> uat.getId().getAreaId())
                .collect(Collectors.toSet());

        double afinidad = jaccard(areasTrabajoIds, areasEval);
        double cargaNorm = maxCarga == 0 ? 0.0 : (double) cargaAbsoluta / maxCarga;
        double disponibilidad = 1.0;

        double bloque = w1 + w2;                       // afinidad + carga
        double f = wmin + (wmax - wmin) * gini;        // fracción del bloque para carga
        double wCargaEff = bloque * f;
        double wAfinEff = bloque - wCargaEff;
        double score = wAfinEff * afinidad + wCargaEff * (1.0 - cargaNorm) + w3 * disponibilidad;

        return new CandidatoScore(candidato, score, afinidad, cargaNorm, disponibilidad,
                gini, wAfinEff, wCargaEff);
    }
```

(e) Extender el record `CandidatoScore` (al final de la clase) con los tres campos nuevos:

```java
    private record CandidatoScore(
            Usuario candidato,
            double score,
            double afinidad,
            double cargaNorm,
            double disponibilidad,
            double gini,
            double wAfinEff,
            double wCargaEff) {
    }
```

(f) Enriquecer `factoresJson` (el `Map.of` no admite duplicados; ampliarlo):

```java
    private String factoresJson(CandidatoScore cs) {
        try {
            return OBJECT_MAPPER.writeValueAsString(Map.of(
                    "afinidad", cs.afinidad(),
                    "carga_norm", cs.cargaNorm(),
                    "disponibilidad", cs.disponibilidad(),
                    "gini", cs.gini(),
                    "w_afin_eff", cs.wAfinEff(),
                    "w_carga_eff", cs.wCargaEff()));
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }
```

> `toResponse(CandidatoScore)` no cambia (el DTO `SugerenciaEvaluadorResponse` queda igual; el gini vive en `factores`).

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=RecomendadorServiceTests`
Expected: PASS (los nuevos + los existentes; si algún test viejo de evaluadores asumía el peso fijo y ahora el orden cambia con gini, ajustá su expectativa al comportamiento modulado — documentá el ajuste en el report).

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/service/RecomendadorService.java src/test/java/com/academconnect/service/RecomendadorServiceTests.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(recomendador): Gini modula el peso de carga en evaluadores"
```

---

## Task 2: Modulación por Gini en orientadores (TDD)

**Files:**
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/service/RecomendadorService.java`
- Test: `/home/ignacio/Projects/academconnect/src/test/java/com/academconnect/service/RecomendadorServiceTests.java`

**Interfaces:**
- Consumes: Task 1 (`gini`, `wmin`/`wmax`).
- Produces: `sugerirOrientadores` calcula el gini y `puntuarOrientador` modula el peso de carga.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `RecomendadorServiceTests`:

```java
    @Test
    void sugerirOrientadores_giniDesbalanceadoPrefiereMenorCarga() {
        // misma afinidad (ambos comparten area1+area2); cargas desbalanceadas.
        Mockito.when(trabajoRepository.findById(trabajoId)).thenReturn(Optional.of(trabajoConAreas));
        Mockito.when(profesorRepository.findByActivo(true)).thenReturn(List.of(profesor1, profesor2));
        Mockito.when(uatRepository.findByIdUsuarioId(Mockito.anyLong()))
                .thenReturn(List.of(uat(profesor1, area1), uat(profesor1, area2)));
        Mockito.when(trabajoRepository.countByOrientadorIdAndEstadoNotIn(
                Mockito.eq(profesor1.getId()), Mockito.anyCollection())).thenReturn(10L);
        Mockito.when(trabajoRepository.countByOrientadorIdAndEstadoNotIn(
                Mockito.eq(profesor2.getId()), Mockito.anyCollection())).thenReturn(0L);

        var res = service.sugerirOrientadores(trabajoId);

        Assertions.assertEquals(profesor2.getId(), res.get(0).id()); // menor carga primero
    }
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=RecomendadorServiceTests#sugerirOrientadores_giniDesbalanceadoPrefiereMenorCarga`
Expected: puede pasar o fallar según los datos; el objetivo del cambio es que `puntuarOrientador` use el gini. Continuá a la implementación igualmente (TDD: el test fija el comportamiento esperado).

- [ ] **Step 3: Implementar la modulación en orientadores**

En `sugerirOrientadores`, calcular el gini una vez (después de `maxCarga`) y pasarlo a `puntuarOrientador`. Cambiar la llamada
`.map(p -> puntuarOrientador(p, areasTrabajoIds, cargas.get(p.getId()), maxCarga))` por:

```java
        double g = gini(cargas.values());

        return candidatos.stream()
                .map(p -> puntuarOrientador(p, areasTrabajoIds, cargas.get(p.getId()), maxCarga, g))
                .sorted(Comparator.comparing(SugerenciaOrientadorResponse::score).reversed()
                        .thenComparing(SugerenciaOrientadorResponse::nombre))
                .toList();
```

Reemplazar el método `puntuarOrientador` por (firma con `double gini` y score modulado):

```java
    private SugerenciaOrientadorResponse puntuarOrientador(
            Profesor p, Set<Long> areasTrabajoIds, long carga, long maxCarga, double gini) {

        var uats = uatRepository.findByIdUsuarioId(p.getId());
        Set<Long> areasProfe = uats.stream()
                .map(u -> u.getId().getAreaId())
                .collect(Collectors.toSet());
        List<String> areasNombres = uats.stream()
                .map(u -> u.getArea() == null ? null : u.getArea().getNombre())
                .filter(java.util.Objects::nonNull)
                .sorted()
                .toList();

        double afinidad = jaccard(areasTrabajoIds, areasProfe);
        double cargaNorm = maxCarga == 0 ? 0.0 : (double) carga / maxCarga;

        double f = wmin + (wmax - wmin) * gini;   // wo1+wo2 = 1, así que el bloque entero es 1
        double wCargaEff = f;
        double wAfinEff = 1.0 - f;
        double score = wAfinEff * afinidad + wCargaEff * (1.0 - cargaNorm);

        return new SugerenciaOrientadorResponse(
                p.getId(), p.getNombre(), p.getEmail(),
                areasNombres, carga, bd4(afinidad), bd4(score));
    }
```

> Nota: con esto los pesos base `wo1`/`wo2` quedan reemplazados por la interpolación `wmin..wmax` (coherente con el spec, que modula el bloque de los dos términos). `wo1`/`wo2` dejan de usarse en `puntuarOrientador`; si quedan sin uso en toda la clase, dejá los campos `@Value` (no romper config) pero está OK que no se referencien. Si preferís conservar `wo1` como piso, el spec no lo pide — seguí el spec.

- [ ] **Step 4: Correr toda la clase de tests**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=RecomendadorServiceTests`
Expected: PASS (nuevos + existentes; ajustá expectativas de tests de orientador que asumían el peso fijo, documentando el ajuste).

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/service/RecomendadorService.java src/test/java/com/academconnect/service/RecomendadorServiceTests.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(recomendador): Gini modula el peso de carga en orientadores"
```

---

## Verificación final

- [ ] Backend: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test` → PASS.
- [ ] Revisión manual de los pesos: con `gini=0` el comportamiento se acerca al peso mínimo de carga (afinidad domina); con `gini` alto, la carga pesa más y, a igual afinidad, gana el menos cargado. El total de pesos sigue sumando 1 en ambos recomendadores.

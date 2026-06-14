# Repositorio — Correcciones de UI y búsqueda

**Fecha:** 2026-06-13
**Alcance:** `src/app/features/repositorio/` + ajuste global `scrollbar-gutter`
**Tipo:** bug fixes / refinamiento UX (sin cambios de API)

## Contexto

Tras una revisión del módulo Repositorio se detectaron 4 issues que afectan la consistencia visual y la usabilidad de la búsqueda. Este spec define las correcciones acotadas a frontend: no requiere cambios de backend ni nuevas dependencias.

## Issues a resolver

### 1. Alineación del selector de orden ("Más recientes")

**Síntoma:** En `.repositorio__sort select` el texto interno queda más cerca del borde izquierdo que el chevron del borde derecho. La asimetría rompe la consistencia con el campo de búsqueda contiguo.

**Causa raíz:** El `<select>` nativo usa rendering propio del navegador para el chevron. Con `padding: 0 var(--sp-4)` en ambos lados, el texto respeta el padding pero el chevron se dibuja con su propio espacio reducido, generando asimetría perceptible.

**Solución:** Tomar control del chevron.
- `appearance: none` (más `-webkit-appearance: none`) en `.repositorio__sort select`.
- Reaplicar `background-image` con un SVG de chevron (mismo color que `--c-text-faint`, igual que la lupa del search).
- `padding: 0 calc(var(--sp-3) + 20px + var(--sp-2)) 0 var(--sp-4)` para reservar espacio del chevron (paralelo a cómo `.repositorio__search input` reserva espacio para la lupa).
- `background-position: right var(--sp-3) center; background-repeat: no-repeat;`.

Resultado: simetría visual con el search bar, consistencia cross-browser.

### 2. Estabilidad de chips de áreas en `<ac-trabajo-card>`

**Síntoma:** Al cambiar filtros, los chips de áreas dentro de cada tarjeta cambian de posición/contenido, alterando la altura de la fila de chips y, por cascada, el layout interno de la tarjeta.

**Causa raíz:** `trabajo-card.ts:26`

```ts
protected readonly resumenAreas = computed(() => this.trabajo().areas.slice(0, 3));
```

El `slice(0, 3)` confía en el orden que devuelve el backend. Cuando se filtra por área, es habitual que el backend devuelva la(s) área(s) coincidente(s) primero (orden no documentado, fuera de nuestro control). Como cada nombre de área tiene ancho distinto, los 3 chips visibles cambian y la fila se reacomoda.

**Solución:** Orden estable client-side por `area.id` antes de aplicar `slice`.

```ts
protected readonly resumenAreas = computed(() =>
  [...this.trabajo().areas].sort((a, b) => a.id - b.id).slice(0, 3),
);
```

- Determinístico (mismas 3 áreas siempre para un mismo trabajo).
- No depende del orden del backend.
- `areasRestantes()` no requiere cambios (sigue siendo `length - 3`).

### 3. Búsqueda tolerante para términos cortos

**Síntoma:** El usuario escribe 1–2 caracteres y el sistema devuelve 0 resultados, frenando la exploración.

**Causa raíz:** El backend hace matching restrictivo; cualquier `q` no vacío se envía y se aplica.

**Solución (frontend, sin tocar API):** Bypass de `q` por debajo de un umbral mínimo.

- Constante `MIN_QUERY_LENGTH = 3` en `repositorio-page.ts`.
- En el effect que arma `TrabajoSearchParams`, computar:

  ```ts
  const trimmed = this.query().trim();
  const qOut = trimmed.length >= MIN_QUERY_LENGTH ? trimmed : null;
  ```

  y pasar `qOut` como `params.q`.

- Si hay query corto activo (`trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH`), exponer un computed `shortQueryHint = true`.
- En el template, sobre el bloque de resultados, mostrar un caption discreto:

  > "Escribí al menos 3 caracteres para buscar — mientras tanto, mostramos resultados relacionados."

  Renderizado con clase `repositorio__hint` (similar a `repositorio__count`), color `--c-text-muted`, sin alterar layout.

- El sync de URL (`syncUrl`) se mantiene tal cual usando `params.q` (que ya es el `qOut` resultante). Esto significa que con query corto la URL no carga `?q=` — aceptable: el bypass es transparente.

Nota: la búsqueda completa (con `q`) sigue funcionando al alcanzar el umbral. No se reemplaza la búsqueda, sólo se evita el resultado vacío en el rango "demasiado corto para ser específico".

### 4. Persistencia del layout durante el filtrado

**Síntomas reportados:** la lista de áreas "se reinicia", la barra de búsqueda cambia de posición, los trabajos se reposicionan junto con otros elementos.

**Causa raíz:** Dos disparadores de reflow concatenados:

1. **Aparición/desaparición del scrollbar vertical** según la altura total de la página. Cuando los resultados encogen y la página deja de overflow-ear verticalmente, el scrollbar desaparece y el contenido se "expande" horizontalmente ~15px. Subjetivamente parece que la barra de búsqueda y todo el layout "se movieron".
2. **Colapso de altura mínima**: si el `<section.repositorio__results>` queda corto, la página entera se acorta y el panel sticky de filtros pierde su anclaje visual (queda flotando arriba).

El componente de filtros no se desmonta entre cambios (Angular usa el mismo `FiltrosRepositorio`, `@for` con `track a.id`). La sensación de "reinicio" es perceptual: el reposicionamiento horizontal hace creer que toda la sidebar saltó.

**Solución (CSS-only, dos cambios):**

1. **Reservar el espacio del scrollbar globalmente.** Agregar a la raíz del documento:

   ```css
   html {
     scrollbar-gutter: stable;
   }
   ```

   Ubicación: `src/styles/_reset.scss`, agregándolo al bloque `html { ... }` existente (línea 13).

2. **Min-height al contenedor de resultados** para que la altura mínima de la página no colapse cuando hay pocos o ningún resultado:

   ```scss
   .repositorio__results {
     min-height: 480px; /* ~3 skeletons de 180px + gap */
   }
   ```

   Esto mantiene anclado el panel sticky y evita saltos perceptibles cuando se pasa de muchos a pocos resultados.

No se modifican: `.repositorio__toolbar`, `.repositorio__layout`, `FiltrosRepositorio.*`, ni el componente `TrabajoCard` (ese ya está cubierto por #2).

## Componentes y archivos tocados

| Archivo | Cambio |
|---|---|
| `src/app/features/repositorio/repositorio-page/repositorio-page.scss` | Custom chevron en `.repositorio__sort select`; `min-height` en `.repositorio__results`. |
| `src/app/features/repositorio/repositorio-page/repositorio-page.ts` | `MIN_QUERY_LENGTH = 3`; bypass de `q` corto en el effect; computed `shortQueryHint`. |
| `src/app/features/repositorio/repositorio-page/repositorio-page.html` | Caption opcional cuando `shortQueryHint()` es `true`. |
| `src/app/features/repositorio/components/trabajo-card/trabajo-card.ts` | Orden estable por `area.id` antes del `slice(0, 3)`. |
| `src/styles/_reset.scss` | Agregar `scrollbar-gutter: stable;` al bloque `html` existente (L13). |

## Criterios de aceptación

1. **Sort selector:** abrir DevTools en la página `/repositorio`; el texto "Más recientes" y el chevron del select deben tener el mismo gap visual con los bordes laterales. Cross-browser (Chromium, Firefox).
2. **Chips de áreas:** aplicar y quitar filtro por una área específica que coincida con un trabajo; los 3 chips visibles en cada tarjeta deben ser los mismos (mismos textos, misma posición) antes y después del filtro.
3. **Búsqueda corta:**
   - Escribir "a" → resultados visibles (no vacío); caption "Escribí al menos 3 caracteres…" presente.
   - Escribir "abc" → búsqueda completa, caption desaparece.
   - Borrar a "ab" → caption reaparece, resultados se mantienen poblados.
4. **Persistencia UI:** aplicar un filtro de área que reduzca los resultados a 1–2; la barra de búsqueda y los filtros laterales no se mueven horizontalmente ni verticalmente. Comprobar visualmente con regla del navegador o tomando screenshot antes/después.

## Fuera de alcance

- Cambios al backend (`/api/trabajos/buscar`).
- Fuzzy matching real (Levenshtein, trigramas) — el bypass de `q` corto es la decisión consciente.
- Refactor del componente `FiltrosRepositorio` o del estado de página.
- Cambios en la página de detalle del trabajo.

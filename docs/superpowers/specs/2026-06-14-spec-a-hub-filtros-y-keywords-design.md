# Spec A — Hub filtros consistente + Keywords compactos en Mis Trabajos

**Fecha:** 2026-06-14
**Items del backlog:** #5 (Hub filtros margen / responsive) + #9 (Keywords compactos en mis-trabajos-detalle)
**Alcance:** UI/CSS y un cambio menor de template. Sin TS lógico, sin backend.

## Contexto

Spec A inaugura el batch de "items 5–10" como el primero de cinco specs (A → B → C → D → E). Agrupa las dos correcciones más chicas — ambas son fixes visuales sin cambio de comportamiento ni nuevas dependencias.

## Issue 1 — Consistencia y responsividad de filtros en el Hub (#5)

### Diagnóstico

Repositorio y Hub usan el mismo componente `<ac-filtros-repositorio>`, pero los wrappers de cada página divergen en tokens y proporciones:

| Wrapper | Max width | Padding | Grid cols | Gap | Breakpoint single-col |
|---|---|---|---|---|---|
| `repositorio-page` | 1180px | `var(--sp-6) var(--sp-5)` | `minmax(220px, 280px) minmax(0, 1fr)` | `var(--sp-5)` | 960px |
| `hub-page` | 1080px | `1.5rem 1rem 3rem` (literales) | `240px 1fr` | `1.5rem` | 840px |

Síntoma reportado: la columna de filtros aparece con margen izquierdo excesivo. Causa: el Hub usa literales en vez de tokens, una columna de filtros con ancho fijo (no responsive), y un breakpoint de 840px que desencaja con Repositorio (960px).

### Solución

Migrar `hub-page.scss` a los mismos tokens y proporciones que `repositorio-page.scss`:

```scss
.hub {
  max-width: 1180px;
  margin: 0 auto;
  padding: var(--sp-6) var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}
.hub__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hub__title {
  margin: 0;
  font-family: var(--ff-serif);
  font-size: clamp(2rem, 3vw, 2.75rem);
  font-weight: var(--fw-regular);
  letter-spacing: var(--ls-tight);
  line-height: var(--lh-tight);
  color: var(--c-text);
}
.hub__layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: var(--sp-5);
  align-items: start;
}
.hub__aside,
.hub__main {
  min-width: 0;
}
@media (max-width: 960px) {
  .hub__layout { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .hub { padding: var(--sp-4) var(--sp-4); }
}
```

El resto de estilos (lista, items, paginación) se preserva pero se migra a tokens donde aplique (`gap`, `padding`, `border-radius`, colores). Mantener mismas clases (`hub__list`, `hub__item`, etc.) para no romper el HTML.

### Validación responsive

- **<640px (mobile):** layout en una sola columna, padding reducido (`var(--sp-4)`), sin scroll horizontal.
- **640–960px (tablet):** single-column con padding completo.
- **>960px (desktop):** two-column con sidebar de 220–280px (responsive) y main flexible.

Los `min-width: 0` en aside/main previenen overflow de hijos grandes.

### Criterios de aceptación

1. Navegar a `/hub` y `/repositorio`. El padding lateral de la página y la columna izquierda de filtros deben verse idénticos en ancho y posición.
2. Resize del viewport en 1280, 960, 700, 480, 360 px. En ningún caso aparece scroll horizontal.
3. En el breakpoint 960px, el layout colapsa a una sola columna **antes** de que el contenido se vea apretado.

## Issue 2 — Keywords compactos en mis-trabajos-detalle (#9)

### Diagnóstico

`src/app/features/mis-trabajos/mis-trabajos-detalle-page/mis-trabajos-detalle-page.html:23-28`:

```html
<ac-card padding="md">
  <h2 class="detalle__h2">Palabras clave</h2>
  <ul class="detalle__kw">
    @for (k of t.keywords; track k) { <li>{{ k }}</li> }
  </ul>
</ac-card>
```

La card dedicada ocupa ~80px verticales para mostrar 3–5 chips. El espacio no aporta valor proporcional.

### Solución

Eliminar la card. Mover los chips al header, debajo de `.detalle__meta`:

```html
<header class="detalle__header">
  <a [routerLink]="['/mis-trabajos']" class="detalle__back">← Volver</a>
  <h1 class="detalle__title">{{ t.titulo }}</h1>
  <p class="detalle__meta">
    {{ tipoLabel[t.tipo] }} · {{ estadoLabel[t.estado] }}
    @if (t.orientadorNombre) { · Orientador: {{ t.orientadorNombre }} }
  </p>
  @if (t.keywords.length > 0) {
    <ul class="detalle__kw" role="list">
      @for (k of t.keywords; track k) { <li>{{ k }}</li> }
    </ul>
  }
</header>
```

- Se reutilizan los estilos `.detalle__kw` existentes (chips con border-radius 999px). No se agregan nuevos estilos.
- El header ya tiene `gap: 0.5rem`, así que los chips quedan visualmente integrados sin spacing extra.
- Sin keywords no se renderiza nada (no placeholder, no card vacía).

### Criterios de aceptación

1. Ir a `/mis-trabajos/{id}` con un trabajo que tenga keywords. Los chips aparecen justo debajo de la línea de meta (tipo · estado · orientador), no en una card aparte.
2. Un trabajo sin keywords no muestra ningún espacio vacío.
3. La altura total de la vista de detalle disminuye respecto al estado anterior.

## Archivos tocados (Spec A)

| Archivo | Cambio |
|---|---|
| `src/app/features/hub/hub-page/hub-page.scss` | Migrar layout a tokens y proporciones de Repositorio. |
| `src/app/features/mis-trabajos/mis-trabajos-detalle-page/mis-trabajos-detalle-page.html` | Mover keywords al header, eliminar la card dedicada. |

## Fuera de alcance (Spec A)

- Cambios en `<ac-filtros-repositorio>` (es compartido y ya funciona bien).
- Cambios en `hub-detalle-page` o `mis-solicitudes-page`.
- Cambios de comportamiento o estado (lógica TS).
- Otras keywords en la app (Repositorio, Mis Trabajos lista, etc.) — fuera del scope solicitado.

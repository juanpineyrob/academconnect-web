# Spec B — Multiselect de áreas temáticas en Mis Trabajos y Mis Publicaciones

**Fecha:** 2026-06-14
**Items del backlog:** #6 (Multiselect áreas)
**Alcance:** Nuevo componente shared + migración de dos consumidores. Sin backend.

## Contexto

El patrón actual de selección de áreas (`<button class="chip">` con toggle) está duplicado en `mis-trabajos-crear-page` y `mis-publicaciones-crear-page`. Funciona para 5–10 opciones pero el seed CNPq importará ~9000 áreas (V3 migration comment). Reemplazo por un dropdown multiselect con buscador, y los seleccionados como lista removible.

## Componente nuevo: `<ac-area-multiselect>`

**Ubicación:** `src/app/shared/ui/area-multiselect/`

**API:**

```ts
readonly areas = input.required<AreaTematica[]>();
readonly value = input<number[]>([]);
readonly valueChange = output<number[]>();
readonly placeholder = input<string>('Seleccionar áreas');
readonly disabled = input<boolean>(false);
```

**Tipos:** `AreaTematica` desde `@features/perfil/perfil.models`.

**Estructura visual:**

```
┌─────────────────────────────────────┐
│ 3 áreas seleccionadas         ▾    │  ← trigger
└─────────────────────────────────────┘
  ↓ open
┌─────────────────────────────────────┐
│ [ Buscar…                        ] │
│ ☑ Ciência da Computação            │
│ ☐ Engenharias                      │
│ ☐ Ciências Biológicas              │
│   …                                │
└─────────────────────────────────────┘

Áreas seleccionadas:
  Ciência da Computação ........... ×
  Inteligência Artificial ......... ×
  Sistemas de Informação .......... ×
```

**Estado interno (signals):**

```ts
private readonly open = signal<boolean>(false);
private readonly searchTerm = signal<string>('');

protected readonly filteredAreas = computed(() => {
  const term = this.searchTerm().trim().toLowerCase();
  const items = this.areas();
  if (!term) return items;
  return items.filter((a) => a.nombre.toLowerCase().includes(term));
});

protected readonly selectedAreas = computed(() => {
  const ids = new Set(this.value());
  return this.areas().filter((a) => ids.has(a.id));
});
```

**Trigger label:**

```ts
protected readonly triggerLabel = computed(() => {
  const n = this.value().length;
  if (n === 0) return this.placeholder();
  if (n === 1) return `${n} área seleccionada`;
  return `${n} áreas seleccionadas`;
});
```

**Comportamiento:**

1. Click en trigger → `open.set(true)`. `effect()` con `afterNextRender` mueve el focus al input de búsqueda.
2. Filtrado client-side por `nombre.toLowerCase().includes(searchTerm.toLowerCase())`.
3. Click en checkbox → toggle inmediato del id en `value`, emite `valueChange`, panel queda abierto.
4. Esc en el panel → cierra.
5. Click fuera del componente → cierra.
6. Click en `×` de un seleccionado → remueve id de `value`, emite `valueChange`. NO abre el panel.

**Outside-click detection (sin `@HostListener`):**

```ts
private readonly host = inject(ElementRef<HTMLElement>);
private readonly destroyRef = inject(DestroyRef);

constructor() {
  fromEvent<MouseEvent>(document, 'mousedown')
    .pipe(
      filter(() => this.open()),
      takeUntilDestroyed(this.destroyRef),
    )
    .subscribe((e) => {
      if (!this.host.nativeElement.contains(e.target as Node)) {
        this.open.set(false);
      }
    });
}
```

Suscripción única que solo actúa cuando el panel está abierto (filter `open()`).

**Accesibilidad:**

- Trigger: `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls="ms-panel-{uniqueId}"`.
- Search input: `role="searchbox"`, label oculto.
- Lista: `role="listbox"`, `aria-multiselectable="true"`.
- Cada opción: `<li role="option" [attr.aria-selected]="isSelected(a.id)">` con checkbox visible.
- Botón remove: `aria-label="Quitar {{nombre}}"`.
- Esc cierra panel sin perder focus en trigger.

**Estilos (resumen):**

- Trigger: matchea `.crear-form__select` actual (border, padding, border-radius). 
- Panel: `position: absolute` debajo del trigger, `z-index: 50`, `max-height: 280px` con scroll interno en la lista, `box-shadow` sutil.
- Lista de seleccionados: `flex-direction: column`, gap `var(--sp-2)`, cada item con border bottom o background suave para separar visualmente.
- Mobile: panel ocupa el ancho del trigger; tap targets `min-height: 44px`.

## Migración de consumidores

### `mis-trabajos-crear-page`

**HTML actual (L27-37):**
```html
<fieldset class="crear-form__field">
  <legend class="crear-form__label">Áreas temáticas</legend>
  <div class="crear-form__chips">
    @for (a of areas(); track a.id) {
      <button type="button" class="crear-form__chip"
              [class.crear-form__chip--active]="isAreaSelected(a.id)"
              [attr.aria-pressed]="isAreaSelected(a.id)"
              (click)="toggleArea(a.id)">{{ a.nombre }}</button>
    }
  </div>
</fieldset>
```

**Reemplazo:**
```html
<fieldset class="crear-form__field">
  <legend class="crear-form__label">Áreas temáticas</legend>
  <ac-area-multiselect
    [areas]="areas()"
    [value]="form.controls.areaIds.value"
    (valueChange)="form.controls.areaIds.setValue($event)" />
</fieldset>
```

**TS:**
- Agregar `AreaMultiselect` al array `imports`.
- Eliminar métodos `isAreaSelected()` y `toggleArea()` (quedan muertos).

**Estilos:**
- Mantener `.crear-form__chip` y `.crear-form__chip--value` — los usa el bloque de keywords (L46-55).

### `mis-publicaciones-crear-page`

Migración idéntica al anterior (mismo patrón, misma estructura de form). Reemplazar el `<fieldset>` de áreas, agregar import, eliminar métodos toggleArea/isAreaSelected si quedan muertos.

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `src/app/shared/ui/area-multiselect/area-multiselect.ts` (nuevo) | Componente standalone OnPush. |
| `src/app/shared/ui/area-multiselect/area-multiselect.html` (nuevo) | Template. |
| `src/app/shared/ui/area-multiselect/area-multiselect.scss` (nuevo) | Estilos. |
| `src/app/features/mis-trabajos/mis-trabajos-crear-page/mis-trabajos-crear-page.html` | Reemplazar fieldset de áreas. |
| `src/app/features/mis-trabajos/mis-trabajos-crear-page/mis-trabajos-crear-page.ts` | Importar componente, eliminar toggleArea/isAreaSelected. |
| `src/app/features/mis-publicaciones/mis-publicaciones-crear-page/mis-publicaciones-crear-page.html` | Idem. |
| `src/app/features/mis-publicaciones/mis-publicaciones-crear-page/mis-publicaciones-crear-page.ts` | Idem. |

## Criterios de aceptación

1. **Selección básica:** En `/mis-trabajos/nuevo`, click en el trigger abre el panel; tildar 3 áreas las suma; al cerrar, el contador muestra "3 áreas seleccionadas" y la lista debajo muestra los 3 con su `×`.
2. **Buscador:** Tipear "comp" filtra la lista a áreas que contienen "comp" (case-insensitive).
3. **Remove:** Click en `×` de un seleccionado lo saca instantáneamente; el form value se actualiza sin abrir el panel.
4. **Cerrar:** Esc cierra el panel; click fuera del componente lo cierra.
5. **Accesibilidad:** Pasar AXE en la página `/mis-trabajos/nuevo`. Atributos ARIA correctos en trigger, listbox, options.
6. **Mobile (<640px):** Panel ocupa ancho del trigger; items con tap target ≥44px. Sin overflow horizontal.
7. **Consistencia:** El mismo flujo funciona idéntico en `/mis-publicaciones/nuevo`.
8. **Persistencia del form:** Al hacer submit del trabajo/necesidad, los `areaIds` enviados al backend son los seleccionados.

## Fuera de alcance

- Áreas como árbol jerárquico (parent/child) — hoy son flat.
- Selección desde el detalle (editar). Spec B sólo cubre la creación.
- Cambiar el filtro de áreas del Repositorio (intencionalmente diferente: scrollable list).
- Backend: ningún cambio.

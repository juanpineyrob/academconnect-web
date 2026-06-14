# Spec F — Versiones-card: botones icónicos uniformes + file picker custom

**Fecha:** 2026-06-14
**Items del backlog:** #11 (homogeneización de acciones) + #12 (file picker custom)
**Alcance:** Solo `<ac-versiones-card>`. Sin backend, sin shared components nuevos.

## Contexto

Spec D2 entregó el componente de versiones. Los items #11 y #12 son refinamientos visuales sobre ese mismo componente:
- #11: tres botones de acción (Descargar / Reemplazar / Eliminar) con anchos distintos (texto variable) y estilos heterogéneos (`<a>` vs `<ac-button variant="ghost">`).
- #12: file input nativo en el modal, sin estilos del sistema.

## #11 — Botones icónicos uniformes

### Diseño

Tres acciones por versión activa, una por histórica. Cada una:

- `<button>` (o `<a>` para descargar) cuadrado **36×36 px**.
- Borde: `1px solid var(--c-border)`, `border-radius: var(--r-md)`.
- Background: `transparent` → `var(--c-surface-hover)` en hover.
- Foco: `outline: 2px solid var(--c-accent); outline-offset: 2px`.
- Disabled: `opacity: 0.5; cursor: not-allowed`.
- Icono SVG inline 20×20 (color `currentColor`, stroke 2).
- `aria-label` describiendo la acción.
- Atributo `title` para tooltip nativo (consistente con el resto del proyecto).
- Variante destructiva ("Eliminar"): mismo size; en hover, `color: var(--c-state-rechazado, #b91c1c)`.

### Iconos

Estilo Feather/Lucide (consistente con la lupa de repositorio y el chevron del multiselect):

- **Descargar:** flecha hacia abajo con base horizontal.
- **Reemplazar:** flecha circular (refresh).
- **Eliminar:** trash can.

### Markup

```html
<a class="versiones__icon-btn"
   [attr.href]="downloadUrl(v.id)"
   target="_blank" rel="noopener"
   title="Descargar"
   aria-label="Descargar v{{ v.numeroVersion }}">
  <svg ...>...</svg>
</a>
```

Aplica tanto a activas como a histórico (donde sólo está "Descargar").

## #12 — File picker custom

### Diseño

Estructura del campo dentro del modal:

```
<label>
  Archivo PDF *

  [📎 Elegir archivo PDF]      ← botón visible
                                    si no hay archivo

  [📎 informe-final.pdf  ✕]     ← chip "con archivo"
                                    si hay archivo
</label>
```

### Implementación

- `<input type="file" accept="application/pdf" hidden>` (sin estilos nativos visibles).
- `<label>` envolvente con `for="..."`: el click en cualquier hijo abre el picker.
- Estado vacío: botón outline 100% width con icono paperclip + texto "Elegir archivo PDF".
- Estado con archivo: una "pill" con icono, nombre del archivo (truncado con ellipsis), y botón ✕ para limpiar.
- Soporta `:focus-within` para mostrar outline cuando el input nativo recibe focus.

### Markup

```html
<div class="versiones__field">
  <span class="versiones__field-label">Archivo PDF *</span>

  <input #fileInput
         id="versiones-file-{{ uid }}"
         type="file"
         accept="application/pdf"
         class="versiones__file-input"
         (change)="onFileChange($event)" />

  @if (!fileName()) {
    <label class="versiones__file-trigger" [attr.for]="'versiones-file-' + uid">
      <svg ...><!-- paperclip --></svg>
      <span>Elegir archivo PDF</span>
    </label>
  } @else {
    <div class="versiones__file-chip">
      <svg ...><!-- paperclip --></svg>
      <span class="versiones__file-name">{{ fileName() }}</span>
      <button type="button"
              class="versiones__file-clear"
              aria-label="Quitar archivo"
              (click)="clearFile()">
        ✕
      </button>
    </div>
  }
</div>
```

### Estado en TS

- `fileName` signal: nombre del archivo elegido o `null`.
- `onFileChange(event)`: extrae `files[0]?.name`, valida tipo, set signal.
- `clearFile()`: limpia `input.value = ''` + `fileName.set(null)`.
- `openModal()` ahora resetea `fileName.set(null)` además de `input.value`.

### Accesibilidad

- El input nativo sigue siendo el control real (preserva accesibilidad, keyboard).
- El label asociado por `for` permite que la barra espaciadora active el picker.
- `:focus-within` en el contenedor padre dibuja el outline (porque el input nativo está oculto pero recibe focus).

## Estilos clave

```scss
.versiones__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--c-border);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--c-text);
  cursor: pointer;
  transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast);

  &:hover { background: var(--c-surface-hover, rgba(0, 0, 0, 0.04)); }
  &:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
  &[disabled], &.is-disabled { opacity: 0.5; cursor: not-allowed; }
}
.versiones__icon-btn--danger:hover { color: var(--c-state-rechazado, #b91c1c); }

.versiones__file-input { display: none; }

.versiones__file-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  border: 1px dashed var(--c-border-strong);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--c-text);
  cursor: pointer;
  font-size: var(--fs-body-sm);
  min-height: 44px;

  &:hover { background: var(--c-surface-hover); }
}

.versiones__file-chip {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-md);
  background: var(--c-surface-alt);
  min-height: 44px;
  min-width: 0;
}

.versiones__file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.versiones__file-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: var(--c-text-muted);

  &:hover { background: rgba(0, 0, 0, 0.08); color: var(--c-text); }
}
```

## Criterios de aceptación

1. **Botones icónicos:** las 3 acciones por versión activa tienen idéntico ancho/alto/padding. Hover/focus/disabled visuales consistentes. Tooltip aparece al hover.
2. **Variante destructiva:** "Eliminar" cambia a color de estado rechazado en hover.
3. **File picker:** sin archivo, muestra trigger outline con icono paperclip + "Elegir archivo PDF". Con archivo, muestra chip con icono, nombre, y ✕. Nombre largo se trunca con ellipsis sin romper layout.
4. **Accesibilidad:** label `for` asocia al input; barra espaciadora desde el trigger abre picker; outline visible al focus.
5. **Mobile:** todo se ve correcto en 360px de ancho. Iconos no se cortan, nombres largos siguen truncando.
6. Build verde.

## Fuera de alcance

- Crear un `<ac-icon-button>` shared (YAGNI; solo se usa acá hoy).
- Crear un `<ac-file-picker>` shared (YAGNI).
- Drag-and-drop en el picker.
- Tooltips custom con flecha (usamos `title` nativo).

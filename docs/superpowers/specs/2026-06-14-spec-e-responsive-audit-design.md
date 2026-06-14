# Spec E — Audit de responsividad y migración a tokens

**Fecha:** 2026-06-14
**Items del backlog:** #10
**Alcance:** Audit estático de responsividad + corrección de hallazgos en 13 páginas (excluye Perfil y Repositorio, ya cubiertos por specs previos).

## Resumen del audit

Realicé audit estático leyendo SCSS + HTML de las 13 páginas listadas. 32 hallazgos:

| Severidad | Cantidad | Naturaleza |
|---|---|---|
| Alta | 1 | Grid sin colapso explícito en móvil chico |
| Media | 21 | Mayormente migración a tokens + algunos breakpoints faltantes |
| Baja | 10 | Cosmético (gaps/paddings literales) |

## Páginas auditadas

1. admin/admin-dashboard-page
2. admin/importar-trabajo-page
3. auth/login-page
4. hub/hub-detalle-page
5. hub/hub-page (mantiene Spec A; revisión)
6. hub/mis-solicitudes-page
7. invitaciones/invitaciones-recibidas-page (touched en Spec C)
8. mis-publicaciones/mis-publicaciones-crear-page (touched en Spec B)
9. mis-publicaciones/mis-publicaciones-detalle-page
10. mis-publicaciones/mis-publicaciones-list-page
11. mis-trabajos/mis-trabajos-crear-page (touched en Spec B)
12. mis-trabajos/mis-trabajos-detalle-page (touched en Specs C, D2)
13. mis-trabajos/mis-trabajos-list-page

## Patrones de fix aplicados

### A) Migración a tokens (cosmético + consistencia)

Sustituciones mecánicas en todas las páginas afectadas:

| Literal → Token |
|---|
| `padding: 1.5rem 1rem 3rem` → `padding: var(--sp-5) var(--sp-4) var(--sp-7)` |
| `gap: 1rem` → `gap: var(--sp-4)` |
| `gap: 0.5rem` → `gap: var(--sp-2)` |
| `gap: 1.5rem` → `gap: var(--sp-5)` |
| `padding: 0.55rem 0.75rem` → `padding: var(--sp-2) var(--sp-3)` |
| `border-radius: 0.5rem` → `border-radius: var(--r-md)` |
| `font-size: 0.85rem` → `font-size: var(--fs-body-sm)` |
| `font-size: 1.5rem` → `font-size: 1.5rem` (mantener literal cuando ya es tamaño semántico de h1, no token) |

Se mantienen literales cuando son específicos (border-width, line-height ratios, etc.).

### B) Breakpoints responsivos faltantes (funcional)

- **admin-dashboard-page**: agregar `@media (max-width: 640px) { grid-template-columns: 1fr; }` al grid de cards.
- **hub/mis-solicitudes-page**: agregar `flex-wrap: wrap` al row de header (botones se cortaban a viewports estrechos); tabs con `overflow-x: auto` y `flex-wrap: nowrap` en mobile.
- **invitaciones-recibidas-page**: misma medida que mis-solicitudes para los tabs (Pendientes/Histórico).
- **login-page**: padding del hero reducido en breakpoint 960px.
- **mis-pubs-list / mis-trabajos-list**: header con `flex-wrap` ya tiene; verificar gap/padding mobile.

### C) Touch targets

- **importar-trabajo-page**: inputs/selects sin `min-height: 44px` explícito en mobile. Aplicado en `@media (max-width: 640px)`.

### D) Re-verificaciones (sin cambio)

- **hub-page**: el breakpoint 640px ya existía (Spec A); auditoría se contradijo.
- Páginas tocadas por specs A/B/C/D2 mantienen consistencia.

## Out-of-scope

- Refactor de componentes (los fixes son al nivel de página/SCSS).
- Cambios al `<ac-card>`, `<ac-button>`, `<ac-area-multiselect>` u otros componentes shared.
- Cambios al routing/shell.
- Tests visuales/E2E (no hay infraestructura).

## Criterios de aceptación

1. `ng build` verde, sin nuevos warnings.
2. En las 13 páginas no se observa scroll horizontal en viewports 320/375/480/640/768/960/1280px (verificación manual del usuario; el spec no testea visualmente).
3. Tokens consistentes: ningún SCSS de página auditada con `padding: 1.5rem 1rem 3rem` literal.
4. Header con botones en list-pages: si el botón no entra, hace wrap a la línea siguiente.
5. Tabs (mis-solicitudes, invitaciones-recibidas): no causan overflow horizontal en mobile (~360px).

## Plan de commit

Un solo commit con todos los fixes agrupados por archivo. No se separa por severidad para evitar churn.

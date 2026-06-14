# Spec C — Justificación opcional del profesor al responder invitación

**Fecha:** 2026-06-14
**Items del backlog:** #7
**Alcance:** Frontend únicamente. Backend ya soporta el contrato.

## Validación previa (backend)

Endpoint `POST /api/invitaciones-orientacion/{id}/{aceptar|rechazar}` acepta body opcional `RespuestaInvitacionRequest { respuesta?: string|null }`. El service persiste `respuesta` + `resueltaEn` (`InvitacionOrientacionService.aceptar/rechazar` L79-132). El response DTO ya incluye `respuesta` y `resueltaEn`. Frontend hoy envía `null` hardcoded — sólo falta exponerlo en el UI.

Cero cambios de backend.

## Cambios frontend

### Componente principal: `invitaciones-recibidas-page` (vista del profesor)

**HTML actual (L35-44):**
```html
@if (i.estado === 'PENDIENTE') {
  <div class="recibidas__actions">
    <ac-button variant="primary" ...>Aceptar</ac-button>
    <ac-button variant="ghost" ...>Rechazar</ac-button>
  </div>
}
```

**Cambio:** agregar `<textarea>` entre el motivo y los botones, sólo para invitaciones pendientes.

```html
@if (i.estado === 'PENDIENTE') {
  <label class="recibidas__respuesta">
    <span class="sr-only">Comentario opcional</span>
    <textarea
      class="recibidas__respuesta-input"
      rows="3"
      maxlength="500"
      placeholder="Comentario opcional (visible para el estudiante)"
      [value]="respuestas().get(i.id) ?? ''"
      (input)="onRespuestaInput(i.id, $any($event.target).value)"></textarea>
  </label>
  <div class="recibidas__actions">
    <ac-button variant="primary" ...>Aceptar</ac-button>
    <ac-button variant="ghost" ...>Rechazar</ac-button>
  </div>
}
```

**TS:**
- Nuevo signal `respuestas = signal<Map<number, string>>(new Map())`.
- Método `onRespuestaInput(id, value)` actualiza el map (set si tiene contenido, delete si vacío).
- `aceptar()` y `rechazar()` extraen `respuestas().get(i.id)?.trim() || null` y lo pasan en el body al service.
- Tras éxito, `respuestas` se limpia del id correspondiente (la card pasa a histórico).

### Componente secundario: `mis-trabajos-detalle-page` (vista del alumno)

Hoy (L60-65):

```html
@for (i of invitaciones(); track i.id) {
  <li>
    <strong>{{ i.profesorNombre }}</strong> — {{ i.estado }}
    @if (i.respuesta) { · {{ i.respuesta }} }
  </li>
}
```

La respuesta queda inline, poco prolija. **Cambio:** separar en línea propia con estilo de cita.

```html
@for (i of invitaciones(); track i.id) {
  <li>
    <div class="detalle__history-head">
      <strong>{{ i.profesorNombre }}</strong> — {{ estadoInvLabel(i.estado) }}
    </div>
    @if (i.respuesta) {
      <p class="detalle__history-respuesta">{{ i.respuesta }}</p>
    }
  </li>
}
```

Con estilo `.detalle__history-respuesta`: padding lateral, border-left de acento, font-style italic, color `--c-text-muted`. Visual estilo "quote".

Se agrega un helper `estadoInvLabel()` para mostrar "Aceptada / Rechazada / Cancelada / Pendiente" en lugar del enum crudo.

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `src/app/features/invitaciones/invitaciones-recibidas-page/invitaciones-recibidas-page.html` | Agregar textarea antes de las acciones. |
| `src/app/features/invitaciones/invitaciones-recibidas-page/invitaciones-recibidas-page.ts` | Signal `respuestas`, método `onRespuestaInput`, envío en aceptar/rechazar. |
| `src/app/features/invitaciones/invitaciones-recibidas-page/invitaciones-recibidas-page.scss` | Estilos del textarea. |
| `src/app/features/mis-trabajos/mis-trabajos-detalle-page/mis-trabajos-detalle-page.html` | Mover respuesta a línea propia. |
| `src/app/features/mis-trabajos/mis-trabajos-detalle-page/mis-trabajos-detalle-page.scss` | Estilo `.detalle__history-respuesta`. |
| `src/app/features/mis-trabajos/mis-trabajos-detalle-page/mis-trabajos-detalle-page.ts` | Helper `estadoInvLabel()` (mapa estado→label). |

## Criterios de aceptación

1. **Profesor responde con comentario:** En `/invitaciones-recibidas`, pendiente. El textarea aparece arriba de los botones. Escribir "Estoy en sabático, no puedo orientar este cuatri" y click Rechazar → request POST envía `{ respuesta: "Estoy en sabático…" }`. Card pasa a histórico mostrando el estado RECHAZADA.
2. **Profesor responde sin comentario:** Dejar el textarea vacío y click Aceptar → request POST envía `{}` o `{ respuesta: null }`. Funciona idéntico a hoy.
3. **Alumno ve la respuesta:** Entrar a `/mis-trabajos/{id}` que tiene una invitación resuelta. La respuesta aparece como bloque destacado debajo del nombre/estado del profesor, con estilo de cita.
4. **Sin respuesta no se renderiza:** Si `respuesta === null`, no aparece bloque vacío.
5. **Charset/persistencia:** texto con tildes y caracteres especiales se guarda y muestra correctamente.

## Fuera de alcance

- Edición posterior de la respuesta (el endpoint no soporta UPDATE; la respuesta queda inmutable).
- Notificaciones al estudiante cuando se responde (ya existe `ActividadEvent` en backend).
- Validación de longitud server-side (puede ser un follow-up; cliente limita a 500 chars).

# Spec D2 — Versionamiento de trabajos (Frontend): UI de entregas en Mis Trabajos

**Fecha:** 2026-06-14
**Items del backlog:** #8 (parte frontend)
**Repositorio:** `academconnect-web`
**Alcance:** Componente, servicio, modelos + integración en `mis-trabajos-detalle-page`. Depende de D1 (backend) ya desplegado.

## Contexto

D1 entregó el contrato backend completo: `GET /api/trabajos/{id}/versiones?includeDeleted=`, `POST` (multipart), `PUT /{id}` (multipart, reemplazar), `DELETE /{id}` (soft). El DTO expone 6 campos de audit. El cap soft de 10 activas se aplica server-side. D2 consume ese contrato desde la vista del estudiante.

## Modelos

`src/app/features/mis-trabajos/versionamiento.models.ts`:

```ts
export interface DocumentoMini {
  id: number;
  nombreOriginal: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export interface Versionamiento {
  id: number;
  trabajoId: number;
  numeroVersion: number;
  comentario: string | null;
  documento: DocumentoMini;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt: string | null;
  deletedBy: string | null;
}
```

## Servicio

`src/app/features/mis-trabajos/versionamiento.service.ts`:

```ts
@Injectable({ providedIn: 'root' })
export class VersionamientoService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  listar(trabajoId: number, includeDeleted = false): Observable<Versionamiento[]> {
    let params = new HttpParams();
    if (includeDeleted) params = params.set('includeDeleted', 'true');
    return this.http.get<Versionamiento[]>(`${this.api}/api/trabajos/${trabajoId}/versiones`, { params });
  }

  crear(trabajoId: number, file: File, comentario?: string): Observable<Versionamiento> {
    const fd = new FormData();
    fd.append('file', file);
    if (comentario) fd.append('comentario', comentario);
    return this.http.post<Versionamiento>(`${this.api}/api/trabajos/${trabajoId}/versiones`, fd);
  }

  reemplazar(trabajoId: number, versionId: number, file: File, comentario?: string): Observable<Versionamiento> {
    const fd = new FormData();
    fd.append('file', file);
    if (comentario) fd.append('comentario', comentario);
    return this.http.put<Versionamiento>(`${this.api}/api/trabajos/${trabajoId}/versiones/${versionId}`, fd);
  }

  eliminar(trabajoId: number, versionId: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/api/trabajos/${trabajoId}/versiones/${versionId}`);
  }

  downloadUrl(trabajoId: number, versionId: number): string {
    return `${this.api}/api/trabajos/${trabajoId}/versiones/${versionId}/documento`;
  }
}
```

## Componente nuevo: `<ac-versiones-card>`

**Ubicación:** `src/app/features/mis-trabajos/components/versiones-card/`

**API:**

```ts
readonly trabajoId = input.required<number>();
```

**Comportamiento:**

1. En construcción, llama `listar(trabajoId(), false)` y guarda en `versiones` signal.
2. Estado:
   - `versiones` signal (activas + opcionalmente histórico según `mostrarHistorico`).
   - `mostrarHistorico` signal (default false).
   - `loading`, `error`, `actionId` (versionId en uso) signals.
   - `modalMode` signal: `'crear' | { tipo: 'reemplazar', versionId, numero }` | null.
   - `comentarioInput` FormControl + `fileInput` ref.
3. `activas` computed: `versiones().filter(v => v.deletedAt == null)`.
4. `historicas` computed: `versiones().filter(v => v.deletedAt != null)`.
5. `puedeAgregar` computed: `activas().length < 10`.

**UI estructura:**

```html
<ac-card padding="md">
  <header class="versiones__head">
    <h2 class="detalle__h2">Versionamiento</h2>
    <div class="versiones__head-actions">
      <span class="versiones__count">{{ activas().length }} / 10</span>
      <ac-button [disabled]="!puedeAgregar()" (click)="abrirModalCrear()">Subir versión</ac-button>
    </div>
  </header>

  @if (loading()) {
    <p>Cargando…</p>
  } @else if (error()) {
    <p role="alert">{{ error() }}</p>
  } @else if (activas().length === 0) {
    <p>Aún no subiste ninguna versión.</p>
  } @else {
    <ul class="versiones__list">
      @for (v of activas(); track v.id) {
        <li class="versiones__item">
          <div class="versiones__item-info">
            <strong>v{{ v.numeroVersion }}</strong> — {{ v.documento.nombreOriginal }}
            <span class="versiones__item-meta">Subido el {{ v.createdAt | date:'mediumDate' }}</span>
            @if (v.comentario) { <p class="versiones__item-comment">{{ v.comentario }}</p> }
          </div>
          <div class="versiones__item-actions">
            <a class="ac-button" [attr.href]="downloadUrl(v.id)" target="_blank">Descargar</a>
            <ac-button variant="ghost" size="sm" (click)="abrirModalReemplazar(v)" [disabled]="actionId() === v.id">Reemplazar</ac-button>
            <ac-button variant="ghost" size="sm" (click)="confirmarEliminar(v)" [disabled]="actionId() === v.id">Eliminar</ac-button>
          </div>
        </li>
      }
    </ul>
  }

  @if (historicas().length > 0) {
    <button type="button" class="versiones__toggle" (click)="toggleHistorico()">
      {{ mostrarHistorico() ? 'Ocultar' : 'Ver' }} histórico ({{ historicas().length }})
    </button>

    @if (mostrarHistorico()) {
      <ul class="versiones__list versiones__list--historico">
        @for (v of historicas(); track v.id) {
          <li class="versiones__item versiones__item--deleted">
            <div class="versiones__item-info">
              <strong>v{{ v.numeroVersion }}</strong> — {{ v.documento.nombreOriginal }}
              <span class="versiones__item-meta">Eliminada el {{ v.deletedAt | date:'mediumDate' }}</span>
            </div>
            <div class="versiones__item-actions">
              <a class="ac-button" [attr.href]="downloadUrl(v.id)" target="_blank">Descargar</a>
            </div>
          </li>
        }
      </ul>
    }
  }
</ac-card>

<dialog #modal class="versiones__modal" (close)="onModalClose()">
  <form (submit)="onSubmit($event)" class="versiones__modal-form">
    <h3>{{ modalMode()?.tipo === 'reemplazar' ? 'Reemplazar v' + modalMode().numero : 'Subir nueva versión' }}</h3>
    <label class="versiones__field">
      <span>Archivo PDF *</span>
      <input #fileInput type="file" accept="application/pdf" required>
    </label>
    <label class="versiones__field">
      <span>Comentario (opcional)</span>
      <textarea [formControl]="comentarioInput" rows="3" maxlength="500"></textarea>
    </label>
    @if (modalError()) { <p role="alert" class="versiones__error">{{ modalError() }}</p> }
    <div class="versiones__modal-actions">
      <ac-button type="button" variant="ghost" (click)="cerrarModal()">Cancelar</ac-button>
      <ac-button type="submit" [loading]="submitting()" [disabled]="submitting()">
        {{ modalMode()?.tipo === 'reemplazar' ? 'Reemplazar' : 'Subir' }}
      </ac-button>
    </div>
  </form>
</dialog>
```

**Toggle histórico:** cuando se activa por primera vez, refetch con `includeDeleted=true` y reemplaza la lista.

**Eliminar:** confirm vía `window.confirm("¿Eliminar v{X}? Quedará en el histórico.")`. Si confirma, `service.eliminar()` y refetch.

**Modal close behavior:** usar API nativa `dialog.showModal()` / `dialog.close()`. El componente mantiene un `viewChild('modal')` con `ElementRef<HTMLDialogElement>`.

**File picker:** `viewChild('fileInput')` con `ElementRef<HTMLInputElement>`. En submit, extraer `files[0]`. Validación client: PDF, max 50MB (configurable).

## Integración en `mis-trabajos-detalle-page`

**TS:** importar `VersionesCard` en `imports`.

**HTML:** insertar `<ac-versiones-card [trabajoId]="t.id" />` después del bloque "Descripción" y antes del bloque de invitaciones.

**Visibilidad:** el componente siempre aparece en esta vista (es la vista del estudiante dueño). Si por seguridad hay una visita ajena, el backend devolverá la lista pero los botones de mutación fallarán con 403; podemos hidearlos client-side comparando `t.estudianteId === currentUser.userId` para una mejor UX. Decisión: **se ocultan acciones de mutación si el caller no es dueño**.

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `src/app/features/mis-trabajos/versionamiento.models.ts` (nuevo) | Tipos. |
| `src/app/features/mis-trabajos/versionamiento.service.ts` (nuevo) | HTTP service. |
| `src/app/features/mis-trabajos/components/versiones-card/versiones-card.ts` (nuevo) | Componente standalone OnPush. |
| `src/app/features/mis-trabajos/components/versiones-card/versiones-card.html` (nuevo) | Template. |
| `src/app/features/mis-trabajos/components/versiones-card/versiones-card.scss` (nuevo) | Estilos. |
| `src/app/features/mis-trabajos/mis-trabajos-detalle-page/mis-trabajos-detalle-page.ts` | Importar VersionesCard. |
| `src/app/features/mis-trabajos/mis-trabajos-detalle-page/mis-trabajos-detalle-page.html` | Insertar el `<ac-versiones-card>`. |

## Criterios de aceptación

1. **Listar:** al entrar a `/mis-trabajos/{id}` la card de Versionamiento muestra las activas en orden DESC por número. Contador correcto. Si =10, botón deshabilitado.
2. **Subir:** click "Subir versión" abre modal. Elegir un PDF + comentario opcional → submit ejecuta POST, refetch, modal cierra. La nueva versión aparece al tope.
3. **Reemplazar:** click "Reemplazar" en una activa abre modal en modo reemplazo. Submit ejecuta PUT, refetch. La vieja desaparece de la lista activa.
4. **Eliminar:** click "Eliminar" muestra confirm. Aceptar ejecuta DELETE, refetch. La versión sale de activas.
5. **Histórico:** si hay eliminadas, aparece "Ver histórico (N)". Click expande la lista debajo con estilo tachado. Re-click oculta.
6. **Errores:** cap excedido (400 server) → mensaje "Máximo 10 entregas activas por trabajo" en el modal sin cerrarlo. Network → mensaje genérico en la card.
7. **Build verde:** `ng build` sin errores ni warnings nuevos.

## Fuera de alcance

- Vista del profesor orientador (solo lectura). Posible follow-up.
- Notificaciones realtime cuando el orientador sube/comenta. ActividadEvent ya existe en backend; UI queda para una feature de notificaciones aparte.
- Versiones del trabajo en estados `APROBADO`/`CANCELADO` (UI sigue mostrando todo; el backend tampoco restringe por estado).
- Diff entre versiones, preview en línea, etc.

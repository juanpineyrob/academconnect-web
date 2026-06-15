# Feed de Actividad — Diseño (Spec G)

**Fecha:** 2026-06-15
**Estado:** Diseño aprobado, pendiente plan de implementación.
**Scope:** Frontend puro. Cero cambios de backend.

---

## 1. Resumen

Dropdown en el header con icono campana que muestra las últimas 20 actividades del usuario autenticado (eventos donde es actor, públicos o donde figura como participante). Badge "no leídas" persistido en `localStorage` por usuario. Sin polling: el feed se refresca al iniciar sesión y al abrir el dropdown. Items con `trabajoId` en payload son clickeables y deeplinkean al detalle del trabajo según el rol del usuario.

**Sin página dedicada.** El dropdown es la única superficie en v1.

---

## 2. Dependencias verificadas

### Backend — listo (cero cambios)

- Tabla `actividad` migrada (`V10__actividad.sql`).
- `GET /me/actividad?limit=N` (default 20, máx 100), `@PreAuthorize("isAuthenticated()")`.
- 23 tipos enumerados en `TipoActividad` (versionamiento, solicitudes, invitaciones, asignaciones, evaluaciones, sesiones, reconocimientos, trabajos, templates).
- 9 services publican `ActividadEvent` con payloads ricos (incluyen `trabajoTitulo`, `evaluadorNombre`, `numeroVersion`, etc.) — no requieren fetches adicionales para renderizar.
- Query del feed ya filtra por actor + público + `participantes_ids` con visibilidad `PARTICIPANTES`.
- Listener `@Async("actividadExecutor")` persiste eventos fuera del flujo de negocio.

### Frontend — infraestructura existente reutilizable

- `environment.apiBase` + `auth.interceptor` inyectan JWT automáticamente.
- Patrón de servicio con `inject(HttpClient)` y `providedIn: 'root'`.
- Sidebar/header layout ya definido (`src/app/layout/header`, `src/app/layout/shell`, `src/app/layout/sidebar`).
- Patrón de dropdown con outside-click ya existe en `src/app/shared/ui/area-multiselect` (basado en `fromEvent(document, 'mousedown')` + `takeUntilDestroyed`).

---

## 3. Arquitectura

```
src/app/features/actividad/
├── actividad.models.ts            ← tipos TS espejando el DTO del backend
├── actividad.service.ts           ← fetch + cache + signal de no-leídos
├── actividad-config.ts            ← mapper TIPO → { icono, render(), link() }
├── time-ago.pipe.ts               ← pipe puro "hace 5 min"
├── group-by-day.ts                ← helper Hoy/Ayer/Esta semana/Antes
└── components/
    └── feed-dropdown/
        ├── feed-dropdown.ts
        ├── feed-dropdown.html
        └── feed-dropdown.scss

src/app/layout/header/             ← MODIFICAR: insertar <ac-feed-dropdown/>
```

- **Sin route nueva.** El dropdown vive dentro del header como un componente standalone, no en `app.routes.ts`.
- **Una sola petición HTTP** por sesión (login) y una por cada apertura del dropdown. Sin `setInterval`.
- **Sin paginación.** `limit=20` fijo. Dropdown con scroll interno si el contenido excede ~480px.

---

## 4. Modelos y tipos

```ts
// actividad.models.ts
export type TipoActividad =
  | 'TRABAJO_CREADO' | 'TRABAJO_PUBLICADO' | 'TRABAJO_CERRADO' | 'TRABAJO_EXPIRADO'
  | 'TRABAJO_APROBADO' | 'TRABAJO_RECHAZADO'
  | 'SOLICITUD_VINCULACION_ENVIADA' | 'SOLICITUD_VINCULACION_APROBADA'
  | 'SOLICITUD_VINCULACION_RECHAZADA' | 'SOLICITUD_VINCULACION_CANCELADA'
  | 'VERSION_SUBIDA' | 'VERSION_REEMPLAZADA' | 'VERSION_ELIMINADA'
  | 'ASIGNACION_CREADA' | 'EVALUACION_COMPLETADA'
  | 'INVITACION_ORIENTACION_ENVIADA' | 'INVITACION_ORIENTACION_ACEPTADA'
  | 'INVITACION_ORIENTACION_RECHAZADA' | 'INVITACION_ORIENTACION_CANCELADA'
  | 'TEMPLATE_CREADO' | 'SESION_PROGRAMADA'
  | 'RECONOCIMIENTO_OTORGADO' | 'RECONOCIMIENTO_REVOCADO';

export type VisibilidadActividad = 'PUBLICA' | 'PRIVADA' | 'PARTICIPANTES';

export interface Actividad {
  id: number;
  tipo: TipoActividad;
  actorId: number | null;
  recursoTipo: string;
  recursoId: number;
  payload: string;           // JSON serializado por el backend; se parsea client-side
  visibilidad: VisibilidadActividad;
  createdAt: string;         // ISO
}
```

El backend devuelve `payload` como `string`. El frontend hace `JSON.parse` con try/catch.

---

## 5. Servicio (`ActividadService`)

```ts
@Injectable({ providedIn: 'root' })
export class ActividadService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly feed = signal<Actividad[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  private readonly lastOpenedAt = signal<string>(this.readLastOpened());

  readonly unreadCount = computed(() => {
    const cutoff = this.lastOpenedAt();
    return this.feed().filter((a) => a.createdAt > cutoff).length;
  });

  refetch(): void {
    this.loading.set(true);
    this.http.get<Actividad[]>(`${environment.apiBase}/me/actividad`, { params: { limit: 20 } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.feed.set(items);
          this.loading.set(false);
          this.error.set(null);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(this.mapError(err));
        },
      });
  }

  markAllRead(): void {
    const now = new Date().toISOString();
    this.lastOpenedAt.set(now);
    const key = this.lastOpenedKey();
    if (key) localStorage.setItem(key, now);
  }

  clear(): void {
    this.feed.set([]);
    this.error.set(null);
  }

  private lastOpenedKey(): string | null {
    const id = this.auth.currentUser()?.id;
    return id ? `feed:lastOpenedAt:${id}` : null;
  }

  private readLastOpened(): string {
    const key = this.lastOpenedKey();
    return (key && localStorage.getItem(key)) ?? '1970-01-01T00:00:00Z';
  }
}
```

- Una `effect` adicional en el service observa `auth.currentUser()`: cuando pasa a no-null, llama `refetch()`; cuando pasa a null, llama `clear()`.
- La clave por `userId` evita mezclar contadores cuando dos cuentas usan el mismo navegador.

---

## 6. Mapper por tipo (`actividad-config.ts`)

```ts
interface TipoConfig {
  icono: string;                                                       // SVG inline (path string)
  render: (payload: Record<string, unknown>, esActor: boolean) => string;
  link?: (payload: Record<string, unknown>, rol: Rol) => string | null;
}

export const TIPO_CONFIG: Record<TipoActividad, TipoConfig> = {
  VERSION_SUBIDA: {
    icono: '<path d="M12 3v12"/>...',
    render: (p, esActor) => esActor
      ? `Subiste v${p['numeroVersion'] ?? '?'} de "${p['trabajoTitulo'] ?? 'trabajo'}"`
      : `Nueva v${p['numeroVersion'] ?? '?'} en "${p['trabajoTitulo'] ?? 'trabajo'}"`,
    link: (p, rol) => trabajoLink(p['trabajoId'], rol),
  },
  // ... 22 más
};

function trabajoLink(trabajoId: unknown, rol: Rol): string | null {
  if (typeof trabajoId !== 'number') return null;
  if (rol === 'ESTUDIANTE') return `/mis-trabajos/${trabajoId}`;
  if (rol === 'EVALUADOR') return `/mis-publicaciones/${trabajoId}`;
  return null;
}
```

- Si un tipo del backend no está mapeado (release futuro), fallback `{ icono: 'circle', render: () => 'Nueva actividad', link: () => null }`.
- Defensivo: cada plantilla tolera campos faltantes con `?? '...'`.

---

## 7. Componente (`FeedDropdown`)

```ts
@Component({
  selector: 'ac-feed-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TimeAgoPipe],
  templateUrl: './feed-dropdown.html',
  styleUrl: './feed-dropdown.scss',
})
export class FeedDropdown {
  protected readonly service = inject(ActividadService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  protected readonly open = signal<boolean>(false);

  protected readonly grupos = computed(() => groupByDay(this.service.feed()));

  constructor() {
    fromEvent<MouseEvent>(document, 'mousedown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ev) => {
        if (this.open() && !this.hostRef.nativeElement.contains(ev.target as Node)) {
          this.open.set(false);
        }
      });
  }

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.open.set(true);
    this.service.refetch();
    queueMicrotask(() => this.service.markAllRead());
  }

  protected onEsc(): void {
    if (this.open()) this.open.set(false);
  }

  protected onItemClick(a: Actividad): void {
    const rol = this.auth.currentUser()?.rol;
    const link = rol ? this.linkFor(a, rol) : null;
    if (!link) return;
    this.open.set(false);
    this.router.navigateByUrl(link);
  }

  protected linkFor(a: Actividad, rol: Rol): string | null {
    return TIPO_CONFIG[a.tipo]?.link?.(parsePayload(a.payload), rol) ?? null;
  }

  protected texto(a: Actividad): string {
    const cfg = TIPO_CONFIG[a.tipo] ?? FALLBACK_CONFIG;
    const esActor = a.actorId === this.auth.currentUser()?.id;
    return cfg.render(parsePayload(a.payload), esActor);
  }
}

function parsePayload(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { return {}; }
}
```

Template (resumen):

```html
<button type="button"
        class="feed__bell"
        [attr.aria-label]="bellLabel()"
        aria-haspopup="menu"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
        (keydown.escape)="onEsc()">
  <svg>...</svg>
  @if (service.unreadCount() > 0) {
    <span class="feed__badge" aria-hidden="true">{{ service.unreadCount() }}</span>
  }
</button>

@if (open()) {
  <div class="feed__panel" role="menu" (keydown.escape)="onEsc()">
    @if (service.loading()) { <p role="status">Cargando…</p> }
    @else if (service.error()) {
      <div class="feed__error">
        <p role="alert">{{ service.error() }}</p>
        <button type="button" (click)="service.refetch()">Reintentar</button>
      </div>
      @if (service.feed().length > 0) { <!-- mostrar lista cacheada igual --> }
    }
    @else if (service.feed().length === 0) {
      <p class="feed__empty">Aún no hay actividad.</p>
    }
    @else {
      @for (grupo of grupos(); track grupo.label) {
        <h3 class="feed__group-title">{{ grupo.label }}</h3>
        <ul role="list">
          @for (a of grupo.items; track a.id) {
            <li>
              <a class="feed__item"
                 [class.feed__item--no-link]="!linkFor(a, auth.currentUser()!.rol)"
                 role="menuitem"
                 (click)="onItemClick(a)">
                <span class="feed__icon" aria-hidden="true">...</span>
                <span class="feed__time">{{ a.createdAt | timeAgo }}</span>
                <span class="feed__text">{{ texto(a) }}</span>
              </a>
            </li>
          }
        </ul>
      }
    }
  </div>
}
```

---

## 8. Data flow

| Trigger | Acciones |
|---|---|
| Login (auth.currentUser pasa a no-null) | `service.refetch()` → badge calculado |
| Click campana (abrir) | `service.refetch()` + `service.markAllRead()` → badge se va |
| Click campana (cerrar) | `open.set(false)`, sin refetch |
| Click fuera / Esc | `open.set(false)` |
| Click item con link | `router.navigateByUrl(link)` + `open.set(false)` |
| Click item sin link | no-op |
| Logout (currentUser pasa a null) | `service.clear()` (no se borra lastOpenedAt) |

---

## 9. Errores y edge cases

| Caso | Comportamiento |
|---|---|
| HTTP 0 / sin conexión | "Sin conexión. Reintentar" + botón. Cache previa se mantiene visible. |
| HTTP 401 | Lo maneja `auth.interceptor` (redirect a /login). |
| HTTP 5xx / `ProblemDetail` | Mostrar `detail` o "No se pudo cargar la actividad." |
| `JSON.parse` falla | `payload = {}`, render con fallbacks `?? '...'`. |
| Tipo no mapeado | `FALLBACK_CONFIG`: icono genérico + "Nueva actividad". |
| `trabajoTitulo` ausente | "(sin título)". |
| `evaluadorNombre` ausente | "(otro usuario)". |
| Error con cache previa | Banner discreto arriba + lista cacheada debajo (no se descarta). |

---

## 10. Accesibilidad

- Botón campana: `aria-label="Actividad reciente"` o `"Actividad reciente, N sin leer"` cuando hay badge; `aria-haspopup="menu"`, `aria-expanded`.
- Panel: `role="menu"`. Items con link son `<a role="menuitem">`; sin link, `<div role="menuitem" tabindex="-1">`.
- `Esc` cierra y restaura foco al botón.
- Tab dentro del panel itera por los items.
- Badge: contraste WCAG AA (≥ 4.5:1).
- AXE 0 violations en panel abierto.

---

## 11. Testing

### Unit (Jasmine/Karma)

| Archivo | Casos |
|---|---|
| `actividad-config.spec.ts` | Para cada uno de los 23 tipos, payload representativo → `render()` produce texto esperado y no lanza. Tipos con `trabajoId`: `link(payload, 'ESTUDIANTE')` → `/mis-trabajos/N`, `link(payload, 'EVALUADOR')` → `/mis-publicaciones/N`. Tipos sin trabajoId → `link()` retorna `null`. Tipo desconocido → fallback no lanza. |
| `time-ago.pipe.spec.ts` | "ahora" (<60s), "hace X min" (<1h), "hace X h" (<24h), "hace X d" (<7d), "hace X sem" (≥7d). ISO inválido → string vacío sin throw. |
| `group-by-day.spec.ts` | Dado un array con timestamps fijos y `Date.now()` mockeado, reparte correctamente en hoy/ayer/esta semana/antes. |
| `actividad.service.spec.ts` | `refetch()` setea loading/error/feed contra `HttpTestingController`. `unreadCount` = 0 cuando lastOpenedAt > todos los createdAt. `markAllRead()` persiste en localStorage con clave `feed:lastOpenedAt:<userId>`. `clear()` vacía el feed sin tocar localStorage. |

### Componente (Jasmine)

| Caso | Verificación |
|---|---|
| Default cerrado | Panel ausente del DOM; `aria-expanded="false"`. |
| Badge | `unreadCount() > 0` → badge visible con número; `aria-label` incluye "N sin leer". |
| Toggle abierto | `service.refetch` y `service.markAllRead` llamados; panel en DOM; `aria-expanded="true"`. |
| Outside click cierra | `mousedown` en `document.body` → panel desaparece. |
| Esc cierra y restaura foco | `keydown.escape` → panel desaparece; foco vuelve al botón campana. |
| Item con link navega | Click → `router.navigateByUrl` con ruta; panel se cierra. |
| Item sin link | Click → router no llamado; panel queda abierto. |
| Estado vacío | `feed()` vacío → texto "Aún no hay actividad". |
| Error con cache | `error()` set + `feed()` con items → banner de error visible Y lista cacheada visible. |

### Verificación en navegador (manual antes de merge)

- [ ] Login: badge con N correcto.
- [ ] Abrir dropdown: badge se va, lista agrupada Hoy/Ayer/Esta semana/Antes.
- [ ] Click en item con `trabajoId`: navega y cierra dropdown.
- [ ] Click en item sin link (RECONOCIMIENTO_OTORGADO): no navega, no rompe.
- [ ] Acción en otra pestaña → cerrar/abrir dropdown → actividad nueva aparece arriba.
- [ ] Cambio de usuario en el mismo navegador: badge arranca de cero.
- [ ] Logout + login: feed se limpia y recarga.
- [ ] Mobile ~360px: dropdown no se sale del viewport.
- [ ] Teclado: Tab al botón, Enter abre, Esc cierra, Tab dentro itera items.
- [ ] AXE: cero violations en panel abierto.

---

## 12. Out of scope (v1)

- Página `/actividad` con historial completo.
- Polling / WebSocket / real-time.
- Sincronización del badge entre dispositivos (requiere backend tracker).
- Filtros por tipo o por recurso.
- Marcar items individuales como leídos.
- Acciones inline (ej: aprobar solicitud desde el feed).
- Agrupación visual de eventos consecutivos del mismo recurso.

Cualquiera de estos puede sumarse en una iteración posterior sin romper el contrato actual.

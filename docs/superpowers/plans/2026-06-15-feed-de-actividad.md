# Feed de Actividad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a header bell dropdown showing the user's last 20 activities, with an unread badge persisted in localStorage and clickable items that deeplink to the related trabajo.

**Architecture:** Frontend-only. One Angular feature module (`features/actividad/`) with a singleton service that fetches `GET /me/actividad?limit=20`, exposes a `feed` signal and a computed `unreadCount`, plus a standalone `<ac-feed-dropdown>` component embedded inside the existing `Header` (replacing the disabled placeholder bell). No new route. No polling.

**Tech Stack:** Angular 21 standalone components, signals, Vitest (`@angular/build:unit-test`), RxJS (`fromEvent` + `takeUntilDestroyed`), SVG inline icons (Feather-style).

**Spec:** `docs/superpowers/specs/2026-06-15-feed-de-actividad-design.md`

---

## File Structure

**Create:**
- `src/app/features/actividad/actividad.models.ts` — TS types mirroring backend DTO.
- `src/app/features/actividad/actividad-config.ts` — `TIPO_CONFIG` mapper (23 entries) + `FALLBACK_CONFIG` + `trabajoLink()`.
- `src/app/features/actividad/actividad-config.spec.ts` — table-driven tests for the 23 mappings.
- `src/app/features/actividad/time-ago.pipe.ts` — pure pipe "hace X".
- `src/app/features/actividad/time-ago.pipe.spec.ts`
- `src/app/features/actividad/group-by-day.ts` — pure helper Hoy/Ayer/Esta semana/Antes.
- `src/app/features/actividad/group-by-day.spec.ts`
- `src/app/features/actividad/actividad.service.ts` — fetch + cache + unread badge logic.
- `src/app/features/actividad/actividad.service.spec.ts`
- `src/app/features/actividad/components/feed-dropdown/feed-dropdown.ts`
- `src/app/features/actividad/components/feed-dropdown/feed-dropdown.html`
- `src/app/features/actividad/components/feed-dropdown/feed-dropdown.scss`
- `src/app/features/actividad/components/feed-dropdown/feed-dropdown.spec.ts`

**Modify:**
- `src/app/layout/header/header.ts` — import `FeedDropdown`.
- `src/app/layout/header/header.html` — replace the disabled placeholder bell button (currently `aria-label="Notificaciones (próximamente)"`) with `<ac-feed-dropdown />`.

**Do not touch:** backend, `app.routes.ts`, sidebar.

---

## Task 1: TS models for Actividad

**Files:**
- Create: `src/app/features/actividad/actividad.models.ts`

- [ ] **Step 1: Write the models file**

```ts
export type TipoActividad =
  | 'TRABAJO_CREADO'
  | 'TRABAJO_PUBLICADO'
  | 'TRABAJO_CERRADO'
  | 'TRABAJO_EXPIRADO'
  | 'TRABAJO_APROBADO'
  | 'TRABAJO_RECHAZADO'
  | 'SOLICITUD_VINCULACION_ENVIADA'
  | 'SOLICITUD_VINCULACION_APROBADA'
  | 'SOLICITUD_VINCULACION_RECHAZADA'
  | 'SOLICITUD_VINCULACION_CANCELADA'
  | 'VERSION_SUBIDA'
  | 'VERSION_REEMPLAZADA'
  | 'VERSION_ELIMINADA'
  | 'ASIGNACION_CREADA'
  | 'EVALUACION_COMPLETADA'
  | 'INVITACION_ORIENTACION_ENVIADA'
  | 'INVITACION_ORIENTACION_ACEPTADA'
  | 'INVITACION_ORIENTACION_RECHAZADA'
  | 'INVITACION_ORIENTACION_CANCELADA'
  | 'TEMPLATE_CREADO'
  | 'SESION_PROGRAMADA'
  | 'RECONOCIMIENTO_OTORGADO'
  | 'RECONOCIMIENTO_REVOCADO';

export type VisibilidadActividad = 'PUBLICA' | 'PRIVADA' | 'PARTICIPANTES';

export interface Actividad {
  id: number;
  tipo: TipoActividad;
  actorId: number | null;
  recursoTipo: string;
  recursoId: number;
  payload: string;
  visibilidad: VisibilidadActividad;
  createdAt: string;
}
```

- [ ] **Step 2: Verify TS compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/actividad/actividad.models.ts
git commit -m "feat(actividad): tipos TS para feed de actividad"
```

---

## Task 2: `time-ago` pipe (TDD)

**Files:**
- Create: `src/app/features/actividad/time-ago.pipe.ts`
- Test: `src/app/features/actividad/time-ago.pipe.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { TimeAgoPipe } from './time-ago.pipe';

describe('TimeAgoPipe', () => {
  const NOW = new Date('2026-06-15T12:00:00Z').getTime();
  let pipe: TimeAgoPipe;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    pipe = new TimeAgoPipe();
  });

  afterEach(() => vi.useRealTimers());

  it('returns "ahora" for under 60 seconds', () => {
    expect(pipe.transform('2026-06-15T11:59:30Z')).toBe('ahora');
  });

  it('returns "hace N min" for under 1 hour', () => {
    expect(pipe.transform('2026-06-15T11:55:00Z')).toBe('hace 5 min');
  });

  it('returns "hace N h" for under 24 hours', () => {
    expect(pipe.transform('2026-06-15T09:00:00Z')).toBe('hace 3 h');
  });

  it('returns "hace N d" for under 7 days', () => {
    expect(pipe.transform('2026-06-13T12:00:00Z')).toBe('hace 2 d');
  });

  it('returns "hace N sem" for 7+ days', () => {
    expect(pipe.transform('2026-06-01T12:00:00Z')).toBe('hace 2 sem');
  });

  it('returns empty string for invalid input', () => {
    expect(pipe.transform('not-a-date')).toBe('');
    expect(pipe.transform('')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='src/app/features/actividad/time-ago.pipe.spec.ts' --watch=false`
Expected: FAIL — `TimeAgoPipe` not found.

- [ ] **Step 3: Implement the pipe**

```ts
// src/app/features/actividad/time-ago.pipe.ts
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'timeAgo', pure: true })
export class TimeAgoPipe implements PipeTransform {
  transform(iso: string | null | undefined): string {
    if (!iso) return '';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    const deltaSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (deltaSec < 60) return 'ahora';
    const min = Math.floor(deltaSec / 60);
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `hace ${d} d`;
    const sem = Math.floor(d / 7);
    return `hace ${sem} sem`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --include='src/app/features/actividad/time-ago.pipe.spec.ts' --watch=false`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/actividad/time-ago.pipe.ts src/app/features/actividad/time-ago.pipe.spec.ts
git commit -m "feat(actividad): pipe timeAgo con tests"
```

---

## Task 3: `group-by-day` helper (TDD)

**Files:**
- Create: `src/app/features/actividad/group-by-day.ts`
- Test: `src/app/features/actividad/group-by-day.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { groupByDay, GrupoActividad } from './group-by-day';
import type { Actividad } from './actividad.models';

function mk(id: number, createdAt: string): Actividad {
  return {
    id, tipo: 'VERSION_SUBIDA', actorId: 1, recursoTipo: 'VERSIONAMIENTO',
    recursoId: id, payload: '{}', visibilidad: 'PARTICIPANTES', createdAt,
  };
}

describe('groupByDay', () => {
  const NOW = new Date('2026-06-15T12:00:00Z').getTime();
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => vi.useRealTimers());

  it('returns empty array for empty input', () => {
    expect(groupByDay([])).toEqual([]);
  });

  it('groups items into Hoy / Ayer / Esta semana / Antes', () => {
    const items = [
      mk(1, '2026-06-15T08:00:00Z'),
      mk(2, '2026-06-15T01:00:00Z'),
      mk(3, '2026-06-14T22:00:00Z'),
      mk(4, '2026-06-11T10:00:00Z'),
      mk(5, '2026-06-01T10:00:00Z'),
    ];
    const groups: GrupoActividad[] = groupByDay(items);
    expect(groups.map((g) => g.label)).toEqual(['Hoy', 'Ayer', 'Esta semana', 'Antes']);
    expect(groups[0].items.map((i) => i.id)).toEqual([1, 2]);
    expect(groups[1].items.map((i) => i.id)).toEqual([3]);
    expect(groups[2].items.map((i) => i.id)).toEqual([4]);
    expect(groups[3].items.map((i) => i.id)).toEqual([5]);
  });

  it('skips empty groups', () => {
    const items = [mk(1, '2026-06-15T08:00:00Z'), mk(2, '2026-06-01T10:00:00Z')];
    const groups = groupByDay(items);
    expect(groups.map((g) => g.label)).toEqual(['Hoy', 'Antes']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='src/app/features/actividad/group-by-day.spec.ts' --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implement the helper**

```ts
// src/app/features/actividad/group-by-day.ts
import type { Actividad } from './actividad.models';

export interface GrupoActividad {
  label: 'Hoy' | 'Ayer' | 'Esta semana' | 'Antes';
  items: Actividad[];
}

export function groupByDay(items: Actividad[]): GrupoActividad[] {
  if (items.length === 0) return [];
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 24 * 3600 * 1000;
  const startWeek = startToday - 7 * 24 * 3600 * 1000;

  const buckets: Record<GrupoActividad['label'], Actividad[]> = {
    Hoy: [], Ayer: [], 'Esta semana': [], Antes: [],
  };
  for (const a of items) {
    const t = Date.parse(a.createdAt);
    if (Number.isNaN(t)) { buckets.Antes.push(a); continue; }
    if (t >= startToday) buckets.Hoy.push(a);
    else if (t >= startYesterday) buckets.Ayer.push(a);
    else if (t >= startWeek) buckets['Esta semana'].push(a);
    else buckets.Antes.push(a);
  }

  const order: GrupoActividad['label'][] = ['Hoy', 'Ayer', 'Esta semana', 'Antes'];
  return order
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, items: buckets[label] }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --include='src/app/features/actividad/group-by-day.spec.ts' --watch=false`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/actividad/group-by-day.ts src/app/features/actividad/group-by-day.spec.ts
git commit -m "feat(actividad): helper groupByDay (Hoy/Ayer/Esta semana/Antes)"
```

---

## Task 4: TIPO_CONFIG mapper (TDD)

**Files:**
- Create: `src/app/features/actividad/actividad-config.ts`
- Test: `src/app/features/actividad/actividad-config.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { TIPO_CONFIG, FALLBACK_CONFIG, getConfig, parsePayload } from './actividad-config';
import type { TipoActividad } from './actividad.models';

const ALL_TIPOS: TipoActividad[] = [
  'TRABAJO_CREADO', 'TRABAJO_PUBLICADO', 'TRABAJO_CERRADO', 'TRABAJO_EXPIRADO',
  'TRABAJO_APROBADO', 'TRABAJO_RECHAZADO',
  'SOLICITUD_VINCULACION_ENVIADA', 'SOLICITUD_VINCULACION_APROBADA',
  'SOLICITUD_VINCULACION_RECHAZADA', 'SOLICITUD_VINCULACION_CANCELADA',
  'VERSION_SUBIDA', 'VERSION_REEMPLAZADA', 'VERSION_ELIMINADA',
  'ASIGNACION_CREADA', 'EVALUACION_COMPLETADA',
  'INVITACION_ORIENTACION_ENVIADA', 'INVITACION_ORIENTACION_ACEPTADA',
  'INVITACION_ORIENTACION_RECHAZADA', 'INVITACION_ORIENTACION_CANCELADA',
  'TEMPLATE_CREADO', 'SESION_PROGRAMADA',
  'RECONOCIMIENTO_OTORGADO', 'RECONOCIMIENTO_REVOCADO',
];

describe('actividad-config', () => {
  it('covers every TipoActividad', () => {
    for (const t of ALL_TIPOS) expect(TIPO_CONFIG[t]).toBeDefined();
  });

  it('render() never throws on representative payload', () => {
    const payload = {
      trabajoId: 42, trabajoTitulo: 'Tesis X', evaluadorNombre: 'Ana',
      estudianteNombre: 'Juan', numeroVersion: 3,
    };
    for (const t of ALL_TIPOS) {
      const txt = TIPO_CONFIG[t].render(payload, true);
      expect(txt.length).toBeGreaterThan(0);
    }
  });

  it('render() tolerates missing payload fields', () => {
    for (const t of ALL_TIPOS) {
      expect(() => TIPO_CONFIG[t].render({}, false)).not.toThrow();
    }
  });

  it('link() returns /mis-trabajos/N for ESTUDIANTE when trabajoId present', () => {
    const cfg = TIPO_CONFIG.VERSION_SUBIDA;
    expect(cfg.link?.({ trabajoId: 7 }, 'ESTUDIANTE')).toBe('/mis-trabajos/7');
  });

  it('link() returns /mis-publicaciones/N for PROFESOR when trabajoId present', () => {
    const cfg = TIPO_CONFIG.VERSION_SUBIDA;
    expect(cfg.link?.({ trabajoId: 7 }, 'PROFESOR')).toBe('/mis-publicaciones/7');
  });

  it('link() returns null when trabajoId missing', () => {
    const cfg = TIPO_CONFIG.VERSION_SUBIDA;
    expect(cfg.link?.({}, 'ESTUDIANTE')).toBeNull();
  });

  it('link() returns null for tipos without link (TEMPLATE_CREADO)', () => {
    expect(TIPO_CONFIG.TEMPLATE_CREADO.link).toBeUndefined();
  });

  it('getConfig() returns FALLBACK_CONFIG for unknown type', () => {
    expect(getConfig('UNKNOWN' as TipoActividad)).toBe(FALLBACK_CONFIG);
  });

  it('parsePayload returns {} for invalid JSON', () => {
    expect(parsePayload('not-json')).toEqual({});
    expect(parsePayload('')).toEqual({});
  });

  it('parsePayload parses valid JSON', () => {
    expect(parsePayload('{"a":1}')).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='src/app/features/actividad/actividad-config.spec.ts' --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implement the config**

```ts
// src/app/features/actividad/actividad-config.ts
import type { Rol } from '@core/auth/models';
import type { Actividad, TipoActividad } from './actividad.models';

export interface TipoConfig {
  icon: string;
  render: (payload: Record<string, unknown>, esActor: boolean) => string;
  link?: (payload: Record<string, unknown>, rol: Rol) => string | null;
}

const ICONS = {
  upload: '<path d="M12 3v12"/><polyline points="6 11 12 17 18 11"/><path d="M5 21h14"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  circle: '<circle cx="12" cy="12" r="10"/>',
};

export function trabajoLink(payload: Record<string, unknown>, rol: Rol): string | null {
  const id = payload['trabajoId'];
  if (typeof id !== 'number') return null;
  if (rol === 'ESTUDIANTE') return `/mis-trabajos/${id}`;
  if (rol === 'PROFESOR') return `/mis-publicaciones/${id}`;
  return null;
}

const titulo = (p: Record<string, unknown>) => (p['trabajoTitulo'] as string | undefined) ?? '(sin título)';
const evaluador = (p: Record<string, unknown>) => (p['evaluadorNombre'] as string | undefined) ?? 'otro usuario';
const estudiante = (p: Record<string, unknown>) => (p['estudianteNombre'] as string | undefined) ?? 'un estudiante';
const numVer = (p: Record<string, unknown>) => p['numeroVersion'] as number | undefined;

export const TIPO_CONFIG: Record<TipoActividad, TipoConfig> = {
  TRABAJO_CREADO: {
    icon: ICONS.fileText,
    render: (p, esActor) => esActor ? `Creaste el trabajo "${titulo(p)}"` : `Nuevo trabajo "${titulo(p)}"`,
    link: trabajoLink,
  },
  TRABAJO_PUBLICADO: {
    icon: ICONS.send,
    render: (p, esActor) => esActor ? `Publicaste "${titulo(p)}"` : `"${titulo(p)}" fue publicado`,
    link: trabajoLink,
  },
  TRABAJO_CERRADO: {
    icon: ICONS.power,
    render: (p) => `Se cerró la publicación "${titulo(p)}"`,
    link: trabajoLink,
  },
  TRABAJO_EXPIRADO: {
    icon: ICONS.clock,
    render: (p) => `Expiró la publicación "${titulo(p)}"`,
    link: trabajoLink,
  },
  TRABAJO_APROBADO: {
    icon: ICONS.check,
    render: (p) => `"${titulo(p)}" fue aprobado`,
    link: trabajoLink,
  },
  TRABAJO_RECHAZADO: {
    icon: ICONS.x,
    render: (p) => `"${titulo(p)}" fue rechazado`,
    link: trabajoLink,
  },
  SOLICITUD_VINCULACION_ENVIADA: {
    icon: ICONS.send,
    render: (p, esActor) => esActor
      ? `Enviaste una solicitud para "${titulo(p)}"`
      : `${estudiante(p)} envió una solicitud para "${titulo(p)}"`,
    link: trabajoLink,
  },
  SOLICITUD_VINCULACION_APROBADA: {
    icon: ICONS.check,
    render: (p, esActor) => esActor
      ? `Aceptaste a ${estudiante(p)} en "${titulo(p)}"`
      : `Aceptaron tu solicitud en "${titulo(p)}"`,
    link: trabajoLink,
  },
  SOLICITUD_VINCULACION_RECHAZADA: {
    icon: ICONS.x,
    render: (p, esActor) => esActor
      ? `Rechazaste una solicitud en "${titulo(p)}"`
      : `Rechazaron tu solicitud en "${titulo(p)}"`,
    link: trabajoLink,
  },
  SOLICITUD_VINCULACION_CANCELADA: {
    icon: ICONS.x,
    render: (p) => `Solicitud cancelada en "${titulo(p)}"`,
    link: trabajoLink,
  },
  VERSION_SUBIDA: {
    icon: ICONS.upload,
    render: (p, esActor) => {
      const n = numVer(p);
      const v = n != null ? `v${n}` : 'una versión';
      return esActor
        ? `Subiste ${v} de "${titulo(p)}"`
        : `Nueva ${v} en "${titulo(p)}"`;
    },
    link: trabajoLink,
  },
  VERSION_REEMPLAZADA: {
    icon: ICONS.refresh,
    render: (p) => {
      const n = numVer(p);
      return n != null
        ? `Se reemplazó v${n} en "${titulo(p)}"`
        : `Se reemplazó una versión en "${titulo(p)}"`;
    },
    link: trabajoLink,
  },
  VERSION_ELIMINADA: {
    icon: ICONS.trash,
    render: (p) => {
      const n = numVer(p);
      return n != null
        ? `Se eliminó v${n} de "${titulo(p)}"`
        : `Se eliminó una versión de "${titulo(p)}"`;
    },
    link: trabajoLink,
  },
  ASIGNACION_CREADA: {
    icon: ICONS.link,
    render: (p, esActor) => esActor
      ? `Asignaste a ${evaluador(p)} a "${titulo(p)}"`
      : `Te asignaron como evaluador en "${titulo(p)}"`,
    link: trabajoLink,
  },
  EVALUACION_COMPLETADA: {
    icon: ICONS.check,
    render: (p) => `Evaluación completada en "${titulo(p)}"`,
    link: trabajoLink,
  },
  INVITACION_ORIENTACION_ENVIADA: {
    icon: ICONS.mail,
    render: (p, esActor) => esActor
      ? `Invitaste a un orientador para "${titulo(p)}"`
      : `Te invitaron a orientar "${titulo(p)}"`,
    link: trabajoLink,
  },
  INVITACION_ORIENTACION_ACEPTADA: {
    icon: ICONS.check,
    render: (p, esActor) => esActor
      ? `Aceptaste orientar "${titulo(p)}"`
      : `Tu invitación de orientación para "${titulo(p)}" fue aceptada`,
    link: trabajoLink,
  },
  INVITACION_ORIENTACION_RECHAZADA: {
    icon: ICONS.x,
    render: (p, esActor) => esActor
      ? `Rechazaste orientar "${titulo(p)}"`
      : `Tu invitación de orientación para "${titulo(p)}" fue rechazada`,
    link: trabajoLink,
  },
  INVITACION_ORIENTACION_CANCELADA: {
    icon: ICONS.x,
    render: (p) => `Invitación de orientación cancelada para "${titulo(p)}"`,
    link: trabajoLink,
  },
  TEMPLATE_CREADO: {
    icon: ICONS.fileText,
    render: () => 'Se creó un template de evaluación',
  },
  SESION_PROGRAMADA: {
    icon: ICONS.calendar,
    render: (p) => `Sesión de evaluación programada para "${titulo(p)}"`,
    link: trabajoLink,
  },
  RECONOCIMIENTO_OTORGADO: {
    icon: ICONS.award,
    render: () => 'Recibiste un reconocimiento',
  },
  RECONOCIMIENTO_REVOCADO: {
    icon: ICONS.award,
    render: () => 'Un reconocimiento fue revocado',
  },
};

export const FALLBACK_CONFIG: TipoConfig = {
  icon: ICONS.circle,
  render: () => 'Nueva actividad',
};

export function getConfig(tipo: TipoActividad): TipoConfig {
  return TIPO_CONFIG[tipo] ?? FALLBACK_CONFIG;
}

export function parsePayload(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
```

Note: this file imports `Rol` from `@core/auth/models` (path alias already configured in `tsconfig.json`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --include='src/app/features/actividad/actividad-config.spec.ts' --watch=false`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/actividad/actividad-config.ts src/app/features/actividad/actividad-config.spec.ts
git commit -m "feat(actividad): mapper TIPO_CONFIG con 23 tipos + fallback (tests)"
```

---

## Task 5: ActividadService (TDD)

**Files:**
- Create: `src/app/features/actividad/actividad.service.ts`
- Test: `src/app/features/actividad/actividad.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';

import { ActividadService } from './actividad.service';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
import type { Actividad } from './actividad.models';
import type { CurrentUser } from '@core/auth/models';

function mkUser(userId: number): CurrentUser {
  return { userId, nombre: 'U', email: 'u@x', rol: 'ESTUDIANTE', fotoUrl: null };
}

function mkActividad(id: number, createdAt: string): Actividad {
  return {
    id, tipo: 'VERSION_SUBIDA', actorId: 1, recursoTipo: 'VERSIONAMIENTO',
    recursoId: id, payload: '{}', visibilidad: 'PARTICIPANTES', createdAt,
  };
}

describe('ActividadService', () => {
  let service: ActividadService;
  let http: HttpTestingController;
  let userSig: ReturnType<typeof signal<CurrentUser | null>>;

  beforeEach(() => {
    localStorage.clear();
    userSig = signal<CurrentUser | null>(null);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
      ],
    });
    service = TestBed.inject(ActividadService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts with empty feed, no loading, no error', () => {
    expect(service.feed()).toEqual([]);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('refetch() loads items', () => {
    userSig.set(mkUser(1));
    TestBed.tick();
    const req = http.expectOne(`${environment.apiBase}/me/actividad?limit=20`);
    expect(req.request.method).toBe('GET');
    const items = [mkActividad(1, '2026-06-15T10:00:00Z')];
    req.flush(items);
    expect(service.feed()).toEqual(items);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('refetch() sets error on HTTP failure', () => {
    userSig.set(mkUser(1));
    TestBed.tick();
    const req = http.expectOne(`${environment.apiBase}/me/actividad?limit=20`);
    req.flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });
    expect(service.feed()).toEqual([]);
    expect(service.error()).toBeTruthy();
  });

  it('unreadCount counts items newer than lastOpenedAt', () => {
    userSig.set(mkUser(1));
    TestBed.tick();
    const req = http.expectOne(`${environment.apiBase}/me/actividad?limit=20`);
    req.flush([
      mkActividad(1, '2026-06-15T10:00:00Z'),
      mkActividad(2, '2026-06-15T09:00:00Z'),
      mkActividad(3, '2026-06-14T10:00:00Z'),
    ]);
    expect(service.unreadCount()).toBe(3);
  });

  it('markAllRead() persists timestamp per userId and zeroes unreadCount', () => {
    userSig.set(mkUser(42));
    TestBed.tick();
    const req = http.expectOne(`${environment.apiBase}/me/actividad?limit=20`);
    req.flush([mkActividad(1, '2026-06-15T10:00:00Z')]);
    service.markAllRead();
    expect(service.unreadCount()).toBe(0);
    expect(localStorage.getItem('feed:lastOpenedAt:42')).toBeTruthy();
  });

  it('clear() empties feed when user logs out', () => {
    userSig.set(mkUser(1));
    TestBed.tick();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`)
        .flush([mkActividad(1, '2026-06-15T10:00:00Z')]);
    userSig.set(null);
    TestBed.tick();
    expect(service.feed()).toEqual([]);
  });

  it('uses per-user lastOpenedAt key (no leak between users)', () => {
    localStorage.setItem('feed:lastOpenedAt:7', '2099-01-01T00:00:00Z');
    userSig.set(mkUser(1));
    TestBed.tick();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`)
        .flush([mkActividad(1, '2026-06-15T10:00:00Z')]);
    expect(service.unreadCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='src/app/features/actividad/actividad.service.spec.ts' --watch=false`
Expected: FAIL — `ActividadService` not exported.

- [ ] **Step 3: Implement the service**

```ts
// src/app/features/actividad/actividad.service.ts
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';

import { AuthService } from '@core/auth/auth.service';
import { isProblemDetail } from '@core/http/problem-detail';
import { environment } from '@env/environment';

import type { Actividad } from './actividad.models';

const EPOCH = '1970-01-01T00:00:00Z';

@Injectable({ providedIn: 'root' })
export class ActividadService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly feed = signal<Actividad[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  private readonly lastOpenedAt = signal<string>(EPOCH);

  readonly unreadCount = computed(() => {
    const cutoff = this.lastOpenedAt();
    return this.feed().filter((a) => a.createdAt > cutoff).length;
  });

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        this.lastOpenedAt.set(this.readStored(user.userId));
        this.refetch();
      } else {
        this.clear();
      }
    });
  }

  refetch(): void {
    this.loading.set(true);
    this.http
      .get<Actividad[]>(`${environment.apiBase}/me/actividad`, {
        params: new HttpParams().set('limit', 20),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.feed.set(items);
          this.loading.set(false);
          this.error.set(null);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(this.mapError(err));
        },
      });
  }

  markAllRead(): void {
    const userId = this.auth.currentUser()?.userId;
    if (userId == null) return;
    const now = new Date().toISOString();
    this.lastOpenedAt.set(now);
    localStorage.setItem(this.keyFor(userId), now);
  }

  clear(): void {
    this.feed.set([]);
    this.error.set(null);
    this.loading.set(false);
    this.lastOpenedAt.set(EPOCH);
  }

  private keyFor(userId: number): string {
    return `feed:lastOpenedAt:${userId}`;
  }

  private readStored(userId: number): string {
    return localStorage.getItem(this.keyFor(userId)) ?? EPOCH;
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Sin conexión.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return 'No se pudo cargar la actividad.';
  }
}
```

Note: `isProblemDetail` and `environment` already exist in the codebase (see `versionamiento.service.ts` for the same imports). `@env/environment` resolves to `src/environments/environment.ts` via existing path alias.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --include='src/app/features/actividad/actividad.service.spec.ts' --watch=false`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/actividad/actividad.service.ts src/app/features/actividad/actividad.service.spec.ts
git commit -m "feat(actividad): ActividadService con fetch + badge no-leídas (tests)"
```

---

## Task 6: FeedDropdown component

**Files:**
- Create: `src/app/features/actividad/components/feed-dropdown/feed-dropdown.ts`
- Create: `src/app/features/actividad/components/feed-dropdown/feed-dropdown.html`
- Create: `src/app/features/actividad/components/feed-dropdown/feed-dropdown.scss`
- Test: `src/app/features/actividad/components/feed-dropdown/feed-dropdown.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';

import { FeedDropdown } from './feed-dropdown';
import { ActividadService } from '../../actividad.service';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
import type { Actividad } from '../../actividad.models';
import type { CurrentUser } from '@core/auth/models';

function mkUser(userId: number, rol: 'ESTUDIANTE' | 'PROFESOR' = 'ESTUDIANTE'): CurrentUser {
  return { userId, nombre: 'U', email: 'u@x', rol, fotoUrl: null };
}

function mkActividad(id: number, payload = '{"trabajoId":42,"trabajoTitulo":"Tesis"}'): Actividad {
  return {
    id, tipo: 'VERSION_SUBIDA', actorId: 99, recursoTipo: 'VERSIONAMIENTO',
    recursoId: id, payload, visibilidad: 'PARTICIPANTES',
    createdAt: new Date().toISOString(),
  };
}

describe('FeedDropdown', () => {
  let userSig: ReturnType<typeof signal<CurrentUser | null>>;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    userSig = signal<CurrentUser | null>(mkUser(1));
    TestBed.configureTestingModule({
      imports: [FeedDropdown],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('panel is closed by default', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    const panel = fx.nativeElement.querySelector('[role="menu"]');
    expect(panel).toBeNull();
    const bell = fx.nativeElement.querySelector('button.feed__bell') as HTMLButtonElement;
    expect(bell.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows badge when unreadCount > 0', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([mkActividad(1)]);
    fx.detectChanges();
    const badge = fx.nativeElement.querySelector('.feed__badge');
    expect(badge?.textContent?.trim()).toBe('1');
  });

  it('toggle opens panel, calls markAllRead, and clears badge', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([mkActividad(1)]);
    fx.detectChanges();
    const svc = TestBed.inject(ActividadService);
    const spy = vi.spyOn(svc, 'markAllRead');
    const bell = fx.nativeElement.querySelector('button.feed__bell') as HTMLButtonElement;
    bell.click();
    // Refetch fires again on open
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([mkActividad(1)]);
    fx.detectChanges();
    expect(fx.nativeElement.querySelector('[role="menu"]')).not.toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it('Escape key closes the panel', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    (fx.nativeElement.querySelector('button.feed__bell') as HTMLButtonElement).click();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fx.detectChanges();
    expect(fx.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('click outside closes the panel', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    (fx.nativeElement.querySelector('button.feed__bell') as HTMLButtonElement).click();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fx.detectChanges();
    expect(fx.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('click on item with trabajoId navigates and closes panel', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([mkActividad(1)]);
    fx.detectChanges();
    (fx.nativeElement.querySelector('button.feed__bell') as HTMLButtonElement).click();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([mkActividad(1)]);
    fx.detectChanges();
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const item = fx.nativeElement.querySelector('.feed__item') as HTMLElement;
    item.click();
    fx.detectChanges();
    expect(navSpy).toHaveBeenCalledWith('/mis-trabajos/42');
    expect(fx.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('renders empty state when feed is empty', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    (fx.nativeElement.querySelector('button.feed__bell') as HTMLButtonElement).click();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    expect(fx.nativeElement.querySelector('.feed__empty')?.textContent).toContain('Aún no hay actividad');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='src/app/features/actividad/components/feed-dropdown/feed-dropdown.spec.ts' --watch=false`
Expected: FAIL — component not defined.

- [ ] **Step 3: Implement the component TS**

```ts
// src/app/features/actividad/components/feed-dropdown/feed-dropdown.ts
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { fromEvent } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { ActividadService } from '../../actividad.service';
import { TIPO_CONFIG, FALLBACK_CONFIG, parsePayload } from '../../actividad-config';
import { groupByDay } from '../../group-by-day';
import { TimeAgoPipe } from '../../time-ago.pipe';
import type { Actividad } from '../../actividad.models';

@Component({
  selector: 'ac-feed-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TimeAgoPipe],
  templateUrl: './feed-dropdown.html',
  styleUrl: './feed-dropdown.scss',
})
export class FeedDropdown {
  protected readonly service = inject(ActividadService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly open = signal<boolean>(false);
  protected readonly grupos = computed(() => groupByDay(this.service.feed()));

  protected readonly bellLabel = computed(() => {
    const n = this.service.unreadCount();
    return n > 0 ? `Actividad reciente, ${n} sin leer` : 'Actividad reciente';
  });

  constructor() {
    const doc = inject(DOCUMENT);
    fromEvent<MouseEvent>(doc, 'mousedown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ev) => this.onDocMouseDown(ev));
    fromEvent<KeyboardEvent>(doc, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ev) => {
        if (ev.key === 'Escape' && this.open()) this.open.set(false);
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

  protected onItemClick(a: Actividad): void {
    const link = this.linkFor(a);
    if (!link) return;
    this.open.set(false);
    void this.router.navigateByUrl(link);
  }

  protected texto(a: Actividad): string {
    const cfg = TIPO_CONFIG[a.tipo] ?? FALLBACK_CONFIG;
    const esActor = a.actorId != null && a.actorId === this.auth.currentUser()?.userId;
    return cfg.render(parsePayload(a.payload), esActor);
  }

  protected icon(a: Actividad): string {
    return (TIPO_CONFIG[a.tipo] ?? FALLBACK_CONFIG).icon;
  }

  protected linkFor(a: Actividad): string | null {
    const rol = this.auth.currentUser()?.rol;
    if (!rol) return null;
    const cfg = TIPO_CONFIG[a.tipo];
    return cfg?.link?.(parsePayload(a.payload), rol) ?? null;
  }

  protected hasLink(a: Actividad): boolean {
    return this.linkFor(a) !== null;
  }

  private onDocMouseDown(ev: MouseEvent): void {
    if (!this.open()) return;
    const target = ev.target as Node | null;
    if (target && !this.host.nativeElement.contains(target)) {
      this.open.set(false);
    }
  }
}
```

- [ ] **Step 4: Implement the template**

```html
<!-- src/app/features/actividad/components/feed-dropdown/feed-dropdown.html -->
<button
  type="button"
  class="feed__bell"
  [attr.aria-label]="bellLabel()"
  aria-haspopup="menu"
  [attr.aria-expanded]="open()"
  (click)="toggle()">
  <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none"
       stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
  @if (service.unreadCount() > 0) {
    <span class="feed__badge" aria-hidden="true">{{ service.unreadCount() }}</span>
  }
</button>

@if (open()) {
  <div class="feed__panel" role="menu">
    @if (service.loading() && service.feed().length === 0) {
      <p class="feed__status" role="status">Cargando…</p>
    } @else if (service.error() && service.feed().length === 0) {
      <div class="feed__error-block">
        <p role="alert" class="feed__error">{{ service.error() }}</p>
        <button type="button" class="feed__retry" (click)="service.refetch()">Reintentar</button>
      </div>
    } @else if (service.feed().length === 0) {
      <p class="feed__empty">Aún no hay actividad.</p>
    } @else {
      @if (service.error()) {
        <p class="feed__error feed__error--inline" role="alert">
          {{ service.error() }}
          <button type="button" class="feed__retry feed__retry--inline" (click)="service.refetch()">Reintentar</button>
        </p>
      }
      @for (grupo of grupos(); track grupo.label) {
        <h3 class="feed__group-title">{{ grupo.label }}</h3>
        <ul class="feed__list" role="list">
          @for (a of grupo.items; track a.id) {
            <li>
              <div class="feed__item"
                   [class.feed__item--linked]="hasLink(a)"
                   role="menuitem"
                   [attr.tabindex]="hasLink(a) ? 0 : -1"
                   (click)="onItemClick(a)"
                   (keydown.enter)="onItemClick(a)">
                <span class="feed__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                       stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                       [innerHTML]="icon(a)"></svg>
                </span>
                <span class="feed__time">{{ a.createdAt | timeAgo }}</span>
                <span class="feed__text">{{ texto(a) }}</span>
              </div>
            </li>
          }
        </ul>
      }
    }
  </div>
}
```

Note: `[innerHTML]` is safe here because `icon()` returns string literals from a fixed dictionary inside `actividad-config.ts` — no user input flows through it.

- [ ] **Step 5: Implement styles**

```scss
// src/app/features/actividad/components/feed-dropdown/feed-dropdown.scss
:host {
  position: relative;
  display: inline-block;
}

.feed__bell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--c-text);
  cursor: pointer;

  &:hover { background: var(--c-surface-hover, rgba(0,0,0,0.04)); }
  &:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
}

.feed__badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--c-state-rechazado, #b91c1c);
  color: #fff;
  font-size: 10px;
  font-weight: var(--fw-semibold);
  line-height: 16px;
  text-align: center;
}

.feed__panel {
  position: absolute;
  top: calc(100% + var(--sp-2));
  right: 0;
  width: min(380px, 92vw);
  max-height: 480px;
  overflow-y: auto;
  padding: var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-md);
  background: var(--c-surface);
  color: var(--c-text);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 50;
}

.feed__status,
.feed__empty {
  margin: 0;
  padding: var(--sp-3);
  color: var(--c-text-muted);
  font-size: var(--fs-body-sm);
  text-align: center;
}

.feed__error {
  margin: 0;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm);
  background: var(--c-error-bg, #fee2e2);
  color: var(--c-error, #b91c1c);
  font-size: var(--fs-body-sm);
}

.feed__error--inline {
  margin-bottom: var(--sp-3);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}

.feed__retry {
  margin-top: var(--sp-2);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--c-accent);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.feed__retry--inline { margin-top: 0; }

.feed__error-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-4) var(--sp-3);
}

.feed__group-title {
  margin: var(--sp-3) 0 var(--sp-2);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--c-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;

  &:first-child { margin-top: 0; }
}

.feed__list { list-style: none; margin: 0; padding: 0; }

.feed__item {
  display: grid;
  grid-template-columns: 24px auto 1fr;
  align-items: start;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-2);
  border-radius: var(--r-sm);
  font-size: var(--fs-body-sm);
}

.feed__item--linked {
  cursor: pointer;
  &:hover { background: var(--c-surface-hover, rgba(0,0,0,0.04)); }
  &:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
}

.feed__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--c-text-muted);
}

.feed__time {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  white-space: nowrap;
}

.feed__text { color: var(--c-text); word-break: break-word; }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx ng test --include='src/app/features/actividad/components/feed-dropdown/feed-dropdown.spec.ts' --watch=false`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/features/actividad/components/feed-dropdown
git commit -m "feat(actividad): componente FeedDropdown (campana + panel agrupado + tests)"
```

---

## Task 7: Integrate into the Header

**Files:**
- Modify: `src/app/layout/header/header.ts`
- Modify: `src/app/layout/header/header.html`

- [ ] **Step 1: Update header.ts imports**

Find the imports block and replace it (showing the full new version of the imports + the `imports` array of the component decorator):

```ts
// header.ts — imports section
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { fromEvent } from 'rxjs';

import { Avatar } from '@shared/ui/avatar/avatar';
import { AuthService } from '@core/auth/auth.service';
import { FeedDropdown } from '@app/features/actividad/components/feed-dropdown/feed-dropdown';
```

And update the decorator's `imports` array to include `FeedDropdown`:

```ts
@Component({
  selector: 'ac-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, RouterLink, FeedDropdown],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
```

- [ ] **Step 2: Replace the placeholder bell in header.html**

Locate this block in `header.html`:

```html
  <button
    type="button"
    class="header__icon-btn"
    disabled
    aria-label="Notificaciones (próximamente)"
    title="Notificaciones (próximamente)">
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  </button>
```

Replace it with:

```html
  <ac-feed-dropdown />
```

- [ ] **Step 3: Build to verify no compile errors**

Run: `npx ng build --configuration=development`
Expected: build success.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout/header/header.ts src/app/layout/header/header.html
git commit -m "feat(actividad): integrar FeedDropdown en el header (reemplaza placeholder)"
```

---

## Task 8: Manual browser verification

- [ ] **Step 1: Start dev server**

Run: `npx ng serve`
Open: http://localhost:4200 (or the port shown).

- [ ] **Step 2: Run through the manual checklist**

Verify each, marking pass/fail:

- [ ] Login: badge shows N correct based on items newer than stored `feed:lastOpenedAt:<userId>`.
- [ ] Open dropdown: badge clears, list shows groups Hoy/Ayer/Esta semana/Antes.
- [ ] Click item with `trabajoId`: navigates and closes dropdown.
- [ ] Click item without link (e.g., RECONOCIMIENTO_OTORGADO): no navigation, no error.
- [ ] Trigger an event in another tab (upload a version) → close & reopen dropdown → new item appears at top.
- [ ] Logout + login as a different user in same browser: badge starts at unread = items newer than that user's own stored timestamp (independent).
- [ ] Mobile width ~360px: panel does not overflow the viewport horizontally.
- [ ] Keyboard: Tab to bell, Enter opens, Esc closes, Tab through items.
- [ ] AXE DevTools: zero violations on the open panel.

- [ ] **Step 3: Run the full unit suite**

Run: `npx ng test --watch=false`
Expected: all suites pass (existing + new).

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(actividad): ajustes tras verificación en navegador"
```

(Skip if no changes.)

---

## Out of Scope (spec §12)

Reminder — none of the following are part of this plan:
- Página `/actividad` dedicada.
- Polling / WebSocket.
- Sincronización del badge entre dispositivos.
- Filtros por tipo o recurso.
- Marcar items individuales como leídos.
- Acciones inline (aprobar/rechazar desde el feed).

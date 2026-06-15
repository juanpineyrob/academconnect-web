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

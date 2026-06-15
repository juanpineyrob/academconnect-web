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

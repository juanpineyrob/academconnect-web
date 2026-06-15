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

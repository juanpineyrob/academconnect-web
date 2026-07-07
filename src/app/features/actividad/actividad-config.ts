import type { Rol } from '@core/auth/models';
import type { TipoActividad } from './actividad.models';

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
  TRABAJO_VINCULADO: {
    icon: ICONS.check,
    render: (p, esActor) => esActor
      ? `Tomaste el trabajo "${titulo(p)}"`
      : `${estudiante(p)} tomó tu trabajo "${titulo(p)}"`,
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

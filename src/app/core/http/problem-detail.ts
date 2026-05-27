export type ProblemType =
  | 'urn:academconnect:error:bad-credentials'
  | 'urn:academconnect:error:validation'
  | 'urn:academconnect:error:business-rule'
  | 'urn:academconnect:error:data-integrity'
  | 'urn:academconnect:error:not-found'
  | string;

export interface ProblemDetail {
  type: ProblemType;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
  [key: string]: unknown;
}

const MESSAGES: Record<string, string> = {
  'urn:academconnect:error:bad-credentials': 'Correo o contraseña incorrectos.',
  'urn:academconnect:error:validation': 'Revisá los datos ingresados.',
  'urn:academconnect:error:business-rule':
    'No se pudo completar la acción por una regla del sistema.',
  'urn:academconnect:error:data-integrity': 'Conflicto con datos existentes.',
  'urn:academconnect:error:not-found': 'No se encontró el recurso solicitado.',
};

export function isProblemDetail(value: unknown): value is ProblemDetail {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['type'] === 'string' && typeof v['status'] === 'number';
}

export function problemMessage(pd: ProblemDetail): string {
  return MESSAGES[pd.type] ?? pd.detail ?? pd.title ?? 'Error inesperado.';
}

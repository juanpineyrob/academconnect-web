export type PropositoToken = 'ACTIVACION' | 'RESET';

export interface SolicitarCuentaRequest {
  matricula: string;
  email: string;
  nombre: string;
}

export interface MensajeResponse {
  mensaje: string;
}

export interface VerificarTokenRequest {
  token: string;
}

export interface VerificarTokenResponse {
  valido: boolean;
  proposito: PropositoToken | null;
}

export interface EstablecerPasswordRequest {
  token: string;
  password: string;
}

export interface EmailRequest {
  email: string;
}

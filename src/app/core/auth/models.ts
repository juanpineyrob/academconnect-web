export type Rol = 'ESTUDIANTE' | 'PROFESOR' | 'EXTERNO' | 'ADMINISTRADOR';

export interface LoginRequest {
  email: string;
  password: string;
  remember: boolean;
}

export interface AuthResponse {
  token: string;
  userId: number;
  nombre: string;
  email: string;
  rol: Rol;
  fotoUrl: string | null;
}

export interface CurrentUser {
  userId: number;
  nombre: string;
  email: string;
  rol: Rol;
  fotoUrl: string | null;
}

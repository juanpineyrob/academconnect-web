import { Rol } from './models';

export function homeForRole(rol: Rol | undefined): string {
  return rol === 'ADMINISTRADOR' ? '/repositorio' : '/perfil';
}

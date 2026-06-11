import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { Rol } from '@core/auth/models';

interface NavItem {
  label: string;
  route?: string;
  exact?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS_ESTUDIANTE: NavSection[] = [
  {
    title: 'Académico',
    items: [
      { label: 'Mi perfil', route: '/perfil' },
      { label: 'Mis trabajos', route: '/mis-trabajos', exact: false },
      { label: 'Hub de necesidades', route: '/hub', exact: false },
      { label: 'Mis solicitudes', route: '/mis-solicitudes' },
      { label: 'Repositorio', route: '/repositorio', exact: false },
    ],
  },
  {
    title: 'Personal',
    items: [{ label: 'Notificaciones' }, { label: 'Mensajes' }],
  },
  {
    title: 'Sistema',
    items: [{ label: 'Configuración' }],
  },
];

const SECTIONS_EVALUADOR: NavSection[] = [
  {
    title: 'Trabajo',
    items: [
      { label: 'Mi perfil', route: '/perfil' },
      { label: 'Evaluaciones asignadas' },
      { label: 'Bandeja de revisión' },
      { label: 'Invitaciones de orientación', route: '/invitaciones-orientacion' },
      { label: 'Mis publicaciones', route: '/mis-publicaciones', exact: false },
      { label: 'Repositorio', route: '/repositorio', exact: false },
    ],
  },
  {
    title: 'Comunidad',
    items: [{ label: 'Red de colegas' }, { label: 'Mensajes' }],
  },
  {
    title: 'Análisis',
    items: [{ label: 'Métricas' }, { label: 'Reconocimientos' }],
  },
];

const SECTIONS_ADMIN: NavSection[] = [
  {
    title: 'Sistema',
    items: [
      { label: 'Panel de administración', route: '/admin', exact: true },
      { label: 'Repositorio', route: '/repositorio', exact: false },
      { label: 'Importar trabajos', route: '/admin/importar-trabajo' },
      { label: 'Usuarios' },
      { label: 'Áreas' },
      { label: 'Auditoría' },
    ],
  },
];

@Component({
  selector: 'ac-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private readonly auth = inject(AuthService);

  protected readonly user = this.auth.currentUser;
  protected readonly sections = computed<NavSection[]>(() => sectionsFor(this.user()?.rol));
}

const SECTIONS_ANONIMO: NavSection[] = [
  {
    title: 'Público',
    items: [{ label: 'Repositorio', route: '/repositorio', exact: false }],
  },
];

function sectionsFor(rol: Rol | undefined): NavSection[] {
  switch (rol) {
    case 'ESTUDIANTE':
      return SECTIONS_ESTUDIANTE;
    case 'PROFESOR':
    case 'EXTERNO':
      return SECTIONS_EVALUADOR;
    case 'ADMINISTRADOR':
      return SECTIONS_ADMIN;
    default:
      return SECTIONS_ANONIMO;
  }
}

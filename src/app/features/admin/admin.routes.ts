import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { roleGuard } from '@core/auth/role.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./admin-dashboard-page/admin-dashboard-page').then((m) => m.AdminDashboardPage),
    title: 'Panel de administración · AcademConnect',
  },
  {
    path: 'admin/importar-trabajo',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./importar-trabajo-page/importar-trabajo-page').then((m) => m.ImportarTrabajoPage),
    title: 'Importar trabajo · AcademConnect',
  },
  {
    path: 'admin/moderar-trabajos',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./moderar-trabajos-page/moderar-trabajos-page').then((m) => m.ModerarTrabajosPage),
    title: 'Moderar trabajos · AcademConnect',
  },
  {
    path: 'admin/auditoria',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./auditoria-page/auditoria-page').then((m) => m.AuditoriaPage),
    title: 'Auditoría · AcademConnect',
  },
  {
    path: 'admin/areas-tematicas',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./areas-tematicas-page/areas-tematicas-page').then((m) => m.AreasTematicasPage),
    title: 'Áreas temáticas · AcademConnect',
  },
  {
    path: 'admin/usuarios',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./usuarios-page/usuarios-page').then((m) => m.UsuariosPage),
    title: 'Usuarios · AcademConnect',
  },
  {
    path: 'admin/solicitudes',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./solicitudes-page/solicitudes-page').then((m) => m.SolicitudesPage),
    title: 'Solicitudes de cuenta · AcademConnect',
  },
  {
    path: 'admin/importar-usuarios',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./importar-usuarios-page/importar-usuarios-page').then((m) => m.ImportarUsuariosPage),
    title: 'Importar usuarios · AcademConnect',
  },
  {
    path: 'admin/tipos-trabajo-config',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./tipos-trabajo-config-page/tipos-trabajo-config-page')
        .then((m) => m.TiposTrabajoConfigPage),
    title: 'Configuración de evaluaciones · AcademConnect',
  },
];

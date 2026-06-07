import { Routes } from '@angular/router';

import { roleGuard } from '@core/auth/role.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'admin',
    canActivate: [roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./admin-dashboard-page/admin-dashboard-page').then((m) => m.AdminDashboardPage),
    title: 'Panel de administración · AcademConnect',
  },
  {
    path: 'admin/importar-trabajo',
    canActivate: [roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./importar-trabajo-page/importar-trabajo-page').then((m) => m.ImportarTrabajoPage),
    title: 'Importar trabajo · AcademConnect',
  },
];

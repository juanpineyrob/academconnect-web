import { Routes } from '@angular/router';

import { roleGuard } from '@core/auth/role.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'admin/importar-trabajo',
    canActivate: [roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./importar-trabajo-page/importar-trabajo-page').then((m) => m.ImportarTrabajoPage),
    title: 'Importar trabajo · AcademConnect',
  },
];

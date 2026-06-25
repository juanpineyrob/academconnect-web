import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { roleGuard } from '@core/auth/role.guard';
import { unsavedGuard } from './unsaved.guard';

export const EVALUACIONES_ROUTES: Routes = [
  {
    path: 'evaluaciones',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['PROFESOR', 'EXTERNO'] },
    loadComponent: () => import('./cola-page/cola-page').then((m) => m.ColaPage),
    title: 'Evaluaciones · AcademConnect',
  },
  {
    path: 'evaluaciones/:asignacionId',
    canActivate: [authGuard, roleGuard],
    canDeactivate: [unsavedGuard],
    data: { roles: ['PROFESOR', 'EXTERNO'] },
    loadComponent: () => import('./evaluar-page/evaluar-page').then((m) => m.EvaluarPage),
    title: 'Evaluar · AcademConnect',
  },
  {
    path: 'solicitudes-evaluacion',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['PROFESOR', 'EXTERNO'] },
    loadComponent: () =>
      import('./solicitudes-evaluacion-page/solicitudes-evaluacion-page')
        .then((m) => m.SolicitudesEvaluacionPage),
    title: 'Solicitudes de evaluación · AcademConnect',
  },
];

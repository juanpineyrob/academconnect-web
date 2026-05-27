import { Routes } from '@angular/router';

export const PERFIL_ROUTES: Routes = [
  {
    path: 'perfil',
    loadComponent: () =>
      import('./perfil-propio-page/perfil-propio-page').then((m) => m.PerfilPropioPage),
    title: 'Mi perfil · AcademConnect',
  },
];

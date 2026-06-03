import { Routes } from '@angular/router';

export const REPOSITORIO_ROUTES: Routes = [
  {
    path: 'repositorio',
    loadComponent: () =>
      import('./repositorio-page/repositorio-page').then((m) => m.RepositorioPage),
    title: 'Repositorio · AcademConnect',
  },
  {
    path: 'repositorio/:id',
    loadComponent: () =>
      import('./trabajo-detalle-page/trabajo-detalle-page').then((m) => m.TrabajoDetallePage),
    title: 'Trabajo · AcademConnect',
  },
];

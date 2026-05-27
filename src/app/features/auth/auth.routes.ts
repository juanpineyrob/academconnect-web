import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login-page/login-page').then((m) => m.LoginPage),
    title: 'Iniciar sesión · AcademConnect',
  },
];

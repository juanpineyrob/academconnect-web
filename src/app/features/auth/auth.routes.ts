import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login-page/login-page').then((m) => m.LoginPage),
    title: 'Iniciar sesión · AcademConnect',
  },
  {
    path: 'solicitar-cuenta',
    loadComponent: () =>
      import('./solicitar-cuenta-page/solicitar-cuenta-page').then((m) => m.SolicitarCuentaPage),
    title: 'Solicitar cuenta · AcademConnect',
  },
  {
    path: 'establecer-password',
    loadComponent: () =>
      import('./establecer-password-page/establecer-password-page').then(
        (m) => m.EstablecerPasswordPage,
      ),
    title: 'Establecer contraseña · AcademConnect',
  },
  {
    path: 'recuperar-password',
    loadComponent: () =>
      import('./recuperar-password-page/recuperar-password-page').then(
        (m) => m.RecuperarPasswordPage,
      ),
    title: 'Recuperar contraseña · AcademConnect',
  },
];

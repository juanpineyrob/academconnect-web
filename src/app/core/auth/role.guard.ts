import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { Rol } from './models';

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const allowed = (route.data['roles'] as Rol[] | undefined) ?? [];
  const user = auth.currentUser();

  if (user && (allowed.length === 0 || allowed.includes(user.rol))) {
    return true;
  }
  return router.createUrlTree(['/login']);
};

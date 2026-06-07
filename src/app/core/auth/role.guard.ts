import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { homeForRole } from './home-for-role';
import { Rol } from './models';

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const allowed = (route.data['roles'] as Rol[] | undefined) ?? [];
  const user = auth.currentUser();

  if (!user) {
    return router.createUrlTree(['/login']);
  }
  if (allowed.length === 0 || allowed.includes(user.rol)) {
    return true;
  }
  return router.createUrlTree([homeForRole(user.rol)]);
};

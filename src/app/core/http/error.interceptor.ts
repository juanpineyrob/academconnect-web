import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AuthService } from '@core/auth/auth.service';
import { isProblemDetail } from './problem-detail';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const isLogin = req.url.endsWith('/auth/login');
      if (err.status === 401 && !isLogin) {
        auth.clearSession();
        void router.navigate(['/login'], {
          queryParams: { returnUrl: router.url },
        });
      }
      if (isProblemDetail(err.error)) {
        return throwError(() => err);
      }
      return throwError(() => err);
    }),
  );
};

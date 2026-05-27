import { HttpInterceptorFn } from '@angular/common/http';

import { environment } from '@env/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith(environment.apiBase)) {
    return next(req.clone({ withCredentials: true }));
  }
  return next(req);
};

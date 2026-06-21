import { CanDeactivateFn } from '@angular/router';

export interface ConfirmaSalida {
  canDeactivate(): boolean;
}

export const unsavedGuard: CanDeactivateFn<ConfirmaSalida> = (component) => {
  if (component.canDeactivate()) return true;
  return confirm('Tenés cambios sin enviar. ¿Salir igual?');
};

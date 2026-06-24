import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { Input as AcInput } from '@shared/ui/input/input';
import { OnboardingService } from '../onboarding.service';
import { PropositoToken } from '../onboarding.models';

type Estado = 'verificando' | 'valido' | 'invalido' | 'completado';

function passwordsIguales(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirm')?.value;
  if (!password || !confirm) return null;
  return password === confirm ? null : { noCoincide: true };
}

@Component({
  selector: 'ac-establecer-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Button, Card, AcInput],
  templateUrl: './establecer-password-page.html',
  styleUrl: '../solicitar-cuenta-page/solicitar-cuenta-page.scss',
})
export class EstablecerPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly onboarding = inject(OnboardingService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  protected readonly estado = signal<Estado>('verificando');
  protected readonly proposito = signal<PropositoToken | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(255)]],
      confirm: ['', [Validators.required]],
    },
    { validators: passwordsIguales },
  );

  protected readonly heading = computed(() =>
    this.proposito() === 'RESET' ? 'Restablecer contraseña' : 'Activar cuenta',
  );

  protected readonly intro = computed(() =>
    this.proposito() === 'RESET'
      ? 'Elegí una nueva contraseña para tu cuenta.'
      : 'Elegí una contraseña para activar tu cuenta y empezar a usar AcademConnect.',
  );

  protected readonly passwordError = computed(() => {
    if (!this.submitAttempted()) return null;
    const c = this.form.controls.password;
    if (c.valid) return null;
    if (c.hasError('required')) return 'Ingresá una contraseña.';
    if (c.hasError('minlength')) return 'La contraseña debe tener al menos 8 caracteres.';
    if (c.hasError('maxlength')) return 'Máximo 255 caracteres.';
    return null;
  });

  protected readonly confirmError = computed(() => {
    if (!this.submitAttempted()) return null;
    const c = this.form.controls.confirm;
    if (c.hasError('required')) return 'Repetí la contraseña.';
    if (this.form.hasError('noCoincide')) return 'Las contraseñas no coinciden.';
    return null;
  });

  constructor() {
    if (!this.token) {
      this.estado.set('invalido');
      return;
    }
    this.onboarding
      .verificarToken(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (res.valido) {
            this.proposito.set(res.proposito);
            this.estado.set('valido');
          } else {
            this.estado.set('invalido');
          }
        },
        error: () => this.estado.set('invalido'),
      });
  }

  protected onSubmit(): void {
    this.serverError.set(null);
    this.submitAttempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { password } = this.form.getRawValue();

    this.onboarding
      .establecerPassword({ token: this.token, password })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.estado.set('completado');
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          if (err.status === 400) {
            // Token consumido/expirado entre verificar y establecer.
            this.estado.set('invalido');
          } else {
            this.serverError.set('No se pudo guardar la contraseña. Intentá de nuevo.');
          }
        },
      });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { Input as AcInput } from '@shared/ui/input/input';
import { AuthService } from '@core/auth/auth.service';
import { PublicStats, PublicStatsService } from '@core/public/public-stats.service';
import { ProblemDetail, isProblemDetail } from '@core/http/problem-detail';

@Component({
  selector: 'ac-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, Card, AcInput],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stats = inject(PublicStatsService);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    remember: [false],
  });

  protected readonly submitting = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly publicStats = toSignal<PublicStats | null>(this.stats.load(), {
    initialValue: null,
  });

  protected readonly emailError = computed(() => {
    if (!this.submitAttempted()) return null;
    const c = this.form.controls.email;
    if (c.valid) return null;
    if (c.hasError('required')) return 'Ingresá tu correo institucional.';
    if (c.hasError('email')) return 'El formato del correo no es válido.';
    return null;
  });

  protected readonly passwordError = computed(() => {
    if (!this.submitAttempted()) return null;
    const c = this.form.controls.password;
    if (c.valid) return null;
    if (c.hasError('required')) return 'Ingresá tu contraseña.';
    if (c.hasError('minlength')) return 'La contraseña debe tener al menos 8 caracteres.';
    return null;
  });

  protected onSubmit(): void {
    this.serverError.set(null);
    this.submitAttempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { email, password, remember } = this.form.getRawValue();

    this.auth
      .login({ email, password, remember })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/perfil';
          void this.router.navigateByUrl(returnUrl);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.serverError.set(this.mapError(err));
        },
      });
  }

  private mapError(err: HttpErrorResponse): string {
    const pd = isProblemDetail(err.error) ? (err.error as ProblemDetail) : null;
    if (pd?.type === 'urn:academconnect:error:bad-credentials') {
      return 'Correo o contraseña incorrectos.';
    }
    if (pd?.type === 'urn:academconnect:error:business-rule') {
      return 'Tu cuenta no está activa. Contactá a tu administrador institucional.';
    }
    if (err.status === 0) {
      return 'No se pudo conectar con el servidor. Probá de nuevo.';
    }
    return pd?.detail ?? 'No se pudo iniciar sesión. Intentá de nuevo.';
  }
}

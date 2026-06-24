import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { Input as AcInput } from '@shared/ui/input/input';
import { OnboardingService } from '../onboarding.service';

@Component({
  selector: 'ac-recuperar-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Button, Card, AcInput],
  templateUrl: './recuperar-password-page.html',
  styleUrl: '../solicitar-cuenta-page/solicitar-cuenta-page.scss',
})
export class RecuperarPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly onboarding = inject(OnboardingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly submitting = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly enviado = signal(false);

  protected readonly emailError = computed(() => {
    if (!this.submitAttempted()) return null;
    const c = this.form.controls.email;
    if (c.valid) return null;
    if (c.hasError('required')) return 'Ingresá tu correo institucional.';
    if (c.hasError('email')) return 'El formato del correo no es válido.';
    return null;
  });

  protected onSubmit(): void {
    this.submitAttempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { email } = this.form.getRawValue();

    this.onboarding
      .recuperarPassword(email.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Anti-enumeración: misma confirmación pase lo que pase.
        next: () => {
          this.submitting.set(false);
          this.enviado.set(true);
        },
        error: () => {
          this.submitting.set(false);
          this.enviado.set(true);
        },
      });
  }
}

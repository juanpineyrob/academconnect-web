import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Renderer2,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { fromEvent } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { Input as AcInput } from '@shared/ui/input/input';
import { Perfil, PerfilUpdateRequest } from '../../perfil.models';

@Component({
  selector: 'ac-editar-perfil-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, AcInput],
  templateUrl: './editar-perfil-form.html',
  styleUrl: './editar-perfil-form.scss',
})
export class EditarPerfilForm implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly doc = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);

  readonly perfil = input.required<Perfil>();
  readonly saving = input<boolean>(false);
  readonly serverError = input<string | null>(null);

  readonly closeRequested = output<void>();
  readonly save = output<PerfilUpdateRequest>();

  private readonly nombreInput = viewChild<ElementRef<HTMLElement>>('first');

  protected readonly submitAttempted = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      nombre: ['', [Validators.required, Validators.maxLength(200)]],
      edad: this.fb.control<number | null>(null),
      ubicacion: ['', [Validators.maxLength(200)]],
      biografia: [''],
      fotoUrl: ['', [Validators.maxLength(500)]],
      password: ['', [Validators.minLength(8), Validators.maxLength(255)]],
      passwordConfirm: [''],
      titulacion: ['', [Validators.maxLength(200)]],
      cargo: ['', [Validators.maxLength(200)]],
      institucion: ['', [Validators.maxLength(200)]],
      titulo: ['', [Validators.maxLength(200)]],
    },
    { validators: passwordsMatch() },
  );

  protected readonly isProfesor = computed(() => this.perfil().rol === 'PROFESOR');
  protected readonly isExterno = computed(() => this.perfil().rol === 'EXTERNO');

  protected readonly nombreError = computed(() => {
    if (!this.submitAttempted()) return null;
    const c = this.form.controls.nombre;
    if (c.valid) return null;
    if (c.hasError('required')) return 'El nombre es obligatorio.';
    if (c.hasError('maxlength')) return 'Máximo 200 caracteres.';
    return null;
  });

  protected readonly passwordError = computed(() => {
    if (!this.submitAttempted()) return null;
    const c = this.form.controls.password;
    if (c.hasError('minlength')) return 'Mínimo 8 caracteres.';
    if (c.hasError('maxlength')) return 'Máximo 255 caracteres.';
    return null;
  });

  protected readonly passwordConfirmError = computed(() => {
    if (!this.submitAttempted()) return null;
    if (this.form.hasError('passwordsMismatch')) return 'Las contraseñas no coinciden.';
    return null;
  });

  private readonly hydrate = effect(() => {
    const p = this.perfil();
    this.form.reset({
      nombre: p.nombre,
      edad: p.edad,
      ubicacion: p.ubicacion ?? '',
      biografia: p.biografia ?? '',
      fotoUrl: p.fotoUrl ?? '',
      password: '',
      passwordConfirm: '',
      titulacion: p.titulacion ?? '',
      cargo: p.cargo ?? '',
      institucion: p.institucion ?? '',
      titulo: p.titulo ?? '',
    });
  });

  constructor() {
    fromEvent<KeyboardEvent>(this.doc, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        if (e.key === 'Escape') this.closeRequested.emit();
      });

    this.renderer.addClass(this.doc.body, 'ac-no-scroll');
    this.destroyRef.onDestroy(() => this.renderer.removeClass(this.doc.body, 'ac-no-scroll'));
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => this.nombreInput()?.nativeElement.querySelector('input')?.focus());
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeRequested.emit();
  }

  protected onCancel(): void {
    this.closeRequested.emit();
  }

  protected onSubmit(): void {
    this.submitAttempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: PerfilUpdateRequest = {
      nombre: v.nombre.trim(),
      edad: v.edad ?? null,
      ubicacion: emptyToNull(v.ubicacion),
      biografia: emptyToNull(v.biografia),
      fotoUrl: emptyToNull(v.fotoUrl),
    };
    if (v.password) payload.password = v.password;
    if (this.isProfesor()) {
      payload.titulacion = emptyToNull(v.titulacion);
      payload.cargo = emptyToNull(v.cargo);
    }
    if (this.isExterno()) {
      payload.institucion = emptyToNull(v.institucion);
      payload.titulo = emptyToNull(v.titulo);
    }
    this.save.emit(payload);
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return v.length === 0 ? null : v;
}

function passwordsMatch(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const pw = group.get('password')?.value ?? '';
    const confirm = group.get('passwordConfirm')?.value ?? '';
    if (pw.length === 0) return null;
    return pw === confirm ? null : { passwordsMismatch: true };
  };
}

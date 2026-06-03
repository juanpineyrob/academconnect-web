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

import { environment } from '@env/environment';
import { Button } from '@shared/ui/button/button';
import { Input as AcInput } from '@shared/ui/input/input';
import { Perfil, PerfilUpdateRequest } from '../../perfil.models';
import { AvatarCropper } from '../avatar-cropper/avatar-cropper';

export interface EditarPerfilSavePayload {
  payload: PerfilUpdateRequest;
  photoBlob: Blob | null;
  removePhoto: boolean;
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'ac-editar-perfil-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, AcInput, AvatarCropper],
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
  readonly save = output<EditarPerfilSavePayload>();

  private readonly nombreInput = viewChild<ElementRef<HTMLElement>>('first');
  private readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly submitAttempted = signal(false);

  protected readonly cropperFile = signal<File | null>(null);
  protected readonly pendingBlob = signal<Blob | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly photoError = signal<string | null>(null);
  protected readonly removePhoto = signal(false);

  private previewIsObjectUrl = false;

  protected readonly form = this.fb.nonNullable.group(
    {
      nombre: ['', [Validators.required, Validators.maxLength(200)]],
      edad: this.fb.control<number | null>(null),
      ubicacion: ['', [Validators.maxLength(200)]],
      biografia: [''],
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

  protected readonly hasPhoto = computed(
    () => this.previewUrl() !== null && !this.removePhoto(),
  );

  protected readonly resolvedPreviewUrl = computed(() => {
    const url = this.previewUrl();
    if (!url) return null;
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    const absolute = url.startsWith('/') ? `${environment.apiBase}${url}` : url;
    const sep = absolute.includes('?') ? '&' : '?';
    return `${absolute}${sep}v=${encodeURIComponent(this.perfil().updatedAt)}`;
  });

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
      password: '',
      passwordConfirm: '',
      titulacion: p.titulacion ?? '',
      cargo: p.cargo ?? '',
      institucion: p.institucion ?? '',
      titulo: p.titulo ?? '',
    });
    this.releaseObjectUrl();
    this.previewUrl.set(p.fotoUrl ?? null);
    this.previewIsObjectUrl = false;
    this.pendingBlob.set(null);
    this.removePhoto.set(false);
    this.photoError.set(null);
  });

  constructor() {
    fromEvent<KeyboardEvent>(this.doc, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        if (e.key === 'Escape' && !this.cropperFile()) this.closeRequested.emit();
      });

    this.renderer.addClass(this.doc.body, 'ac-no-scroll');
    this.destroyRef.onDestroy(() => {
      this.renderer.removeClass(this.doc.body, 'ac-no-scroll');
      this.releaseObjectUrl();
    });
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

  protected onPickPhoto(): void {
    this.photoError.set(null);
    this.fileInputRef()?.nativeElement.click();
  }

  protected onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      this.photoError.set('Formato no soportado. Usá JPG, PNG o WEBP.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      this.photoError.set('La imagen supera el máximo de 5 MB.');
      return;
    }
    this.photoError.set(null);
    this.cropperFile.set(file);
  }

  protected onCropperClose(): void {
    this.cropperFile.set(null);
  }

  protected onCropApplied(result: { blob: Blob; previewUrl: string }): void {
    this.releaseObjectUrl();
    this.pendingBlob.set(result.blob);
    this.previewUrl.set(result.previewUrl);
    this.previewIsObjectUrl = true;
    this.removePhoto.set(false);
    this.photoError.set(null);
    this.cropperFile.set(null);
  }

  protected onClearPhoto(): void {
    this.releaseObjectUrl();
    this.pendingBlob.set(null);
    this.previewUrl.set(null);
    this.previewIsObjectUrl = false;
    this.removePhoto.set(true);
    this.photoError.set(null);
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
    this.save.emit({
      payload,
      photoBlob: this.pendingBlob(),
      removePhoto: this.removePhoto(),
    });
  }

  private releaseObjectUrl(): void {
    if (this.previewIsObjectUrl) {
      const url = this.previewUrl();
      if (url) URL.revokeObjectURL(url);
    }
    this.previewIsObjectUrl = false;
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

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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { isProblemDetail } from '@core/http/problem-detail';
import {
  AreaTematica,
  EstadoTrabajo,
  TipoTrabajo,
} from '@features/perfil/perfil.models';
import { RepositorioService } from '@features/repositorio/repositorio.service';
import { TIPO_LABEL, ESTADO_LABEL } from '@features/repositorio/repositorio.models';
import { AdminService } from '../admin.service';
import { AdminUsuarioOption, TrabajoAdminImportRequest } from '../admin.models';

const TIPOS: TipoTrabajo[] = ['TCC', 'TESIS', 'PAPER', 'MONOGRAFIA', 'PROYECTO_INVESTIGACION'];
const ESTADOS: EstadoTrabajo[] = [
  'APROBADO',
  'RECHAZADO',
  'EN_EVALUACION',
  'EN_DESARROLLO',
  'ABIERTO',
  'BORRADOR',
  'CANCELADO',
];

@Component({
  selector: 'ac-importar-trabajo-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, Card],
  templateUrl: './importar-trabajo-page.html',
  styleUrl: './importar-trabajo-page.scss',
})
export class ImportarTrabajoPage {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminService);
  private readonly repo = inject(RepositorioService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tipos = TIPOS;
  protected readonly estados = ESTADOS;
  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly estadoLabel = ESTADO_LABEL;

  protected readonly form = this.fb.nonNullable.group({
    titulo: ['', [Validators.required, Validators.maxLength(300)]],
    descripcion: [''],
    tipo: ['TCC' as TipoTrabajo, Validators.required],
    estado: ['APROBADO' as EstadoTrabajo, Validators.required],
    orientadorId: [null as number | null, Validators.required],
    estudianteId: [null as number | null],
    areaIds: [[] as number[]],
    keywords: [[] as string[]],
    puntajeAgregado: [null as number | null],
    evaluadoEn: [''],
    archivoUrl: [''],
  });

  protected readonly keywordInput = this.fb.nonNullable.control('');

  protected readonly profesores = signal<AdminUsuarioOption[]>([]);
  protected readonly estudiantes = signal<AdminUsuarioOption[]>([]);
  protected readonly areas = signal<AreaTematica[]>([]);

  protected readonly loadingOpciones = signal<boolean>(true);
  protected readonly submitting = signal<boolean>(false);
  protected readonly submitAttempted = signal<boolean>(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly keywordsCount = computed(() => this.keywords().length);
  protected readonly keywordsValid = computed(() => {
    const n = this.keywordsCount();
    return n >= 3 && n <= 8;
  });

  constructor() {
    this.loadOpciones();
  }

  protected keywords(): string[] {
    return this.form.controls.keywords.value;
  }

  protected addKeyword(): void {
    const raw = this.keywordInput.value.trim();
    if (!raw) return;
    const normalized = raw.toLowerCase();
    const current = this.keywords();
    if (current.includes(normalized)) {
      this.keywordInput.setValue('');
      return;
    }
    if (current.length >= 8) return;
    this.form.controls.keywords.setValue([...current, normalized]);
    this.keywordInput.setValue('');
  }

  protected removeKeyword(kw: string): void {
    this.form.controls.keywords.setValue(this.keywords().filter((k) => k !== kw));
  }

  protected onKeywordKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addKeyword();
    }
  }

  protected isAreaSelected(id: number): boolean {
    return this.form.controls.areaIds.value.includes(id);
  }

  protected toggleArea(id: number): void {
    const cur = this.form.controls.areaIds.value;
    const next = cur.includes(id) ? cur.filter((a) => a !== id) : [...cur, id];
    this.form.controls.areaIds.setValue(next);
  }

  protected get tituloError(): string | null {
    if (!this.submitAttempted()) return null;
    const c = this.form.controls.titulo;
    if (c.valid) return null;
    if (c.hasError('required')) return 'Ingresá el título del trabajo.';
    if (c.hasError('maxlength')) return 'Máximo 300 caracteres.';
    return null;
  }

  protected get orientadorError(): string | null {
    if (!this.submitAttempted()) return null;
    return this.form.controls.orientadorId.value == null
      ? 'Seleccioná el orientador.'
      : null;
  }

  protected get keywordsError(): string | null {
    if (!this.submitAttempted()) return null;
    const n = this.keywordsCount();
    if (n < 3) return 'Agregá al menos 3 palabras clave.';
    if (n > 8) return 'Máximo 8 palabras clave.';
    return null;
  }

  protected onSubmit(): void {
    this.serverError.set(null);
    this.successMessage.set(null);
    this.submitAttempted.set(true);

    if (this.form.invalid || !this.keywordsValid()) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const payload: TrabajoAdminImportRequest = {
      titulo: v.titulo.trim(),
      descripcion: v.descripcion.trim() || null,
      tipo: v.tipo,
      estado: v.estado,
      orientadorId: v.orientadorId!,
      estudianteId: v.estudianteId ?? null,
      areaIds: v.areaIds,
      keywords: v.keywords,
      puntajeAgregado: v.puntajeAgregado ?? null,
      evaluadoEn: v.evaluadoEn ? toInstant(v.evaluadoEn) : null,
      archivoUrl: v.archivoUrl.trim() || null,
    };

    this.submitting.set(true);
    this.admin
      .importarTrabajo(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (trabajo) => {
          this.submitting.set(false);
          this.successMessage.set(`Trabajo "${trabajo.titulo}" importado correctamente.`);
          void this.router.navigate(['/repositorio', trabajo.id]);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.serverError.set(this.mapError(err));
        },
      });
  }

  private loadOpciones(): void {
    this.loadingOpciones.set(true);
    const empty: AdminUsuarioOption[] = [];
    const emptyAreas: AreaTematica[] = [];

    this.admin
      .listarProfesores()
      .pipe(
        catchError(() => of(empty)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((profes) => this.profesores.set(profes));

    this.admin
      .listarEstudiantes()
      .pipe(
        catchError(() => of(empty)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((alumnos) => this.estudiantes.set(alumnos));

    this.repo
      .listarAreas()
      .pipe(
        catchError(() => of(emptyAreas)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((as) => {
        this.areas.set(as);
        this.loadingOpciones.set(false);
      });
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'No pudimos conectarnos con el servidor.';
    if (err.status === 403) return 'No tenés permisos para importar trabajos.';
    if (isProblemDetail(err.error)) {
      const pd = err.error;
      if (pd.detail) return pd.detail;
    }
    if (err.status >= 500) return 'El servidor tuvo un problema. Probá nuevamente.';
    return 'No se pudo importar el trabajo.';
  }
}

function toInstant(value: string): string {
  const iso = value.length === 16 ? `${value}:00` : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

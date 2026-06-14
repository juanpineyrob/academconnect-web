import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';

import { AreaMultiselect } from '@shared/ui/area-multiselect/area-multiselect';
import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { isProblemDetail } from '@core/http/problem-detail';
import { AreaTematica, TipoTrabajo } from '@features/perfil/perfil.models';
import { RepositorioService } from '@features/repositorio/repositorio.service';
import { TIPO_LABEL } from '@features/repositorio/repositorio.models';
import { MisTrabajosService } from '../mis-trabajos.service';
import { TrabajoEstudianteRequest } from '../mis-trabajos.models';

const TIPOS: TipoTrabajo[] = ['TCC', 'TESIS', 'PAPER', 'MONOGRAFIA', 'PROYECTO_INVESTIGACION'];

@Component({
  selector: 'ac-mis-trabajos-crear-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, AreaMultiselect, Button, Card],
  templateUrl: './mis-trabajos-crear-page.html',
  styleUrl: './mis-trabajos-crear-page.scss',
})
export class MisTrabajosCrearPage {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(MisTrabajosService);
  private readonly repo = inject(RepositorioService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tipos = TIPOS;
  protected readonly tipoLabel = TIPO_LABEL;

  protected readonly form = this.fb.nonNullable.group({
    titulo: ['', [Validators.required, Validators.maxLength(300)]],
    descripcion: [''],
    tipo: ['TCC' as TipoTrabajo, Validators.required],
    areaIds: [[] as number[]],
    keywords: [[] as string[]],
  });

  protected readonly keywordInput = this.fb.nonNullable.control('');
  protected readonly areas = signal<AreaTematica[]>([]);
  protected readonly submitting = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly keywordsCount = computed(() => this.form.controls.keywords.value.length);
  protected readonly keywordsValid = computed(() => {
    const n = this.keywordsCount();
    return n >= 3 && n <= 8;
  });

  constructor() {
    this.repo.listarAreas()
      .pipe(catchError(() => of<AreaTematica[]>([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((as) => this.areas.set(as));
  }

  protected keywords(): string[] { return this.form.controls.keywords.value; }

  protected addKeyword(): void {
    const raw = this.keywordInput.value.trim();
    if (!raw) return;
    const k = raw.toLowerCase();
    const cur = this.keywords();
    if (cur.includes(k) || cur.length >= 8) { this.keywordInput.setValue(''); return; }
    this.form.controls.keywords.setValue([...cur, k]);
    this.keywordInput.setValue('');
  }
  protected removeKeyword(k: string): void {
    this.form.controls.keywords.setValue(this.keywords().filter((x) => x !== k));
  }
  protected onKeywordKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); this.addKeyword(); }
  }
  protected onAreasChange(ids: number[]): void {
    this.form.controls.areaIds.setValue(ids);
  }

  protected get tituloError(): string | null {
    if (!this.submitAttempted()) return null;
    const c = this.form.controls.titulo;
    if (c.hasError('required')) return 'Ingresá un título.';
    if (c.hasError('maxlength')) return 'Máximo 300 caracteres.';
    return null;
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
    this.submitAttempted.set(true);
    if (this.form.invalid || !this.keywordsValid()) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const payload: TrabajoEstudianteRequest = {
      titulo: v.titulo.trim(),
      descripcion: v.descripcion.trim() || null,
      tipo: v.tipo,
      areaIds: v.areaIds,
      keywords: v.keywords,
    };
    this.submitting.set(true);
    this.service.crear(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => { this.submitting.set(false); void this.router.navigate(['/mis-trabajos', t.id]); },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.serverError.set(this.mapError(err));
        },
      });
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Sin conexión.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return 'No se pudo crear el trabajo.';
  }
}

import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { SolicitudEvaluacionService } from '../../solicitud-evaluacion.service';
import { EvaluadorSugerido } from '../../solicitud-evaluacion.models';

@Component({
  selector: 'ac-solicitar-evaluadores-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button],
  templateUrl: './solicitar-evaluadores-form.html',
  styleUrl: './solicitar-evaluadores-form.scss',
})
export class SolicitarEvaluadoresForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SolicitudEvaluacionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly trabajoId = input.required<number>();
  readonly orientadorId = input.required<number>();
  readonly excluidos = input<number[]>([]);
  readonly submitting = input<boolean>(false);
  readonly enviar = output<{ usuarioId: number; motivo: string | null }>();

  protected readonly sugerencias = signal<EvaluadorSugerido[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly query = signal<string>('');

  protected readonly form = this.fb.nonNullable.group({
    usuarioId: [null as number | null, Validators.required],
    motivo: [''],
  });

  protected readonly candidatos = computed(() => {
    const q = this.query().trim().toLowerCase();
    const fuera = new Set<number>([this.orientadorId(), ...this.excluidos()]);
    const base = this.sugerencias().filter((e) => !fuera.has(e.evaluadorId));
    return q ? base.filter((e) => e.nombre.toLowerCase().includes(q)) : base;
  });

  ngOnInit(): void {
    this.service.sugerirEvaluadores(this.trabajoId())
      .pipe(catchError(() => of({ evaluadoresRequeridos: 0, sugerencias: [] })),
            takeUntilDestroyed(this.destroyRef))
      .subscribe((b) => { this.sugerencias.set(b.sugerencias); this.loading.set(false); });
  }

  protected seleccionar(id: number): void {
    this.form.controls.usuarioId.setValue(id);
  }

  protected onQuery(value: string): void {
    this.query.set(value);
  }

  protected onSubmit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.enviar.emit({ usuarioId: v.usuarioId!, motivo: v.motivo.trim() || null });
  }
}

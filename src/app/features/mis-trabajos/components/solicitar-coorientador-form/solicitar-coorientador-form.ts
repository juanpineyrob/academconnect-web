import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { SolicitudCoorientacionService } from '../../solicitud-coorientacion.service';
import { CandidatoCoorientador } from '../../solicitud-coorientacion.models';

@Component({
  selector: 'ac-solicitar-coorientador-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button],
  templateUrl: './solicitar-coorientador-form.html',
  styleUrl: './solicitar-coorientador-form.scss',
})
export class SolicitarCoorientadorForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SolicitudCoorientacionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly orientadorId = input.required<number>();
  readonly submitting = input<boolean>(false);
  readonly enviar = output<{ usuarioId: number; motivo: string | null }>();

  protected readonly candidatos = signal<CandidatoCoorientador[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly query = signal<string>('');

  protected readonly form = this.fb.nonNullable.group({
    usuarioId: [null as number | null, Validators.required],
    motivo: [''],
  });

  protected readonly filtrados = computed(() => {
    const q = this.query().trim().toLowerCase();
    const oid = this.orientadorId();
    const base = this.candidatos().filter((c) => c.id !== oid);
    return q ? base.filter((c) => c.nombre.toLowerCase().includes(q)) : base;
  });

  ngOnInit(): void {
    this.service.listarCandidatos()
      .pipe(catchError(() => of<CandidatoCoorientador[]>([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((cs) => { this.candidatos.set(cs); this.loading.set(false); });
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

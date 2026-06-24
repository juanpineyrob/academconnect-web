import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { TrabajoListItem } from '@features/repositorio/repositorio.models';
import { MisTrabajosService } from '../../mis-trabajos.service';
import { OrientadorSugerido } from '../../mis-trabajos.models';

const TOP_RECOMENDADOS = 3;

@Component({
  selector: 'ac-invitar-orientador-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button],
  templateUrl: './invitar-orientador-form.html',
  styleUrl: './invitar-orientador-form.scss',
})
export class InvitarOrientadorForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(MisTrabajosService);
  private readonly destroyRef = inject(DestroyRef);

  readonly trabajo = input.required<TrabajoListItem>();
  readonly submitting = input<boolean>(false);
  readonly enviar = output<{ profesorId: number; motivo: string | null }>();

  protected readonly sugerencias = signal<OrientadorSugerido[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly query = signal<string>('');

  protected readonly form = this.fb.nonNullable.group({
    profesorId: [null as number | null, Validators.required],
    motivo: [''],
  });

  protected readonly recomendados = computed(() => this.sugerencias().slice(0, TOP_RECOMENDADOS));
  protected readonly todos = computed(() => {
    const q = this.query().trim().toLowerCase();
    const base = this.sugerencias();
    return q ? base.filter((s) => s.nombre.toLowerCase().includes(q)) : base;
  });

  ngOnInit(): void {
    this.service.sugerirOrientadores(this.trabajo().id)
      .pipe(catchError(() => of<OrientadorSugerido[]>([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((ss) => { this.sugerencias.set(ss); this.loading.set(false); });
  }

  protected seleccionar(id: number): void {
    this.form.controls.profesorId.setValue(id);
  }

  protected onQuery(value: string): void {
    this.query.set(value);
  }

  protected onSubmit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.enviar.emit({ profesorId: v.profesorId!, motivo: v.motivo.trim() || null });
  }
}

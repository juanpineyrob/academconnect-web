import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { AdminService } from '@features/admin/admin.service';
import { AdminUsuarioOption } from '@features/admin/admin.models';
import { TrabajoListItem } from '@features/repositorio/repositorio.models';

interface ProfesorRanked extends AdminUsuarioOption {
  score: number;
}

@Component({
  selector: 'ac-invitar-orientador-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button],
  templateUrl: './invitar-orientador-form.html',
  styleUrl: './invitar-orientador-form.scss',
})
export class InvitarOrientadorForm {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  readonly trabajo = input.required<TrabajoListItem>();
  readonly submitting = input<boolean>(false);
  readonly enviar = output<{ profesorId: number; motivo: string | null }>();

  protected readonly profesores = signal<AdminUsuarioOption[]>([]);
  protected readonly loading = signal<boolean>(true);

  protected readonly form = this.fb.nonNullable.group({
    profesorId: [null as number | null, Validators.required],
    motivo: [''],
  });

  protected readonly ranked = computed<ProfesorRanked[]>(() => {
    const t = this.trabajo();
    const profes = this.profesores();
    const trabajoAreaIds = new Set((t.areas ?? []).map((a) => a.id));
    const kw = (t.keywords ?? []).map((k) => k.toLowerCase());
    return profes
      .map((p) => ({ ...p, score: scoreProfesor(p, trabajoAreaIds, kw) }))
      .sort((a, b) => b.score - a.score || a.nombre.localeCompare(b.nombre));
  });

  constructor() {
    this.admin.listarProfesores()
      .pipe(catchError(() => of<AdminUsuarioOption[]>([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((ps) => { this.profesores.set(ps); this.loading.set(false); });
  }

  protected onSubmit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.enviar.emit({ profesorId: v.profesorId!, motivo: v.motivo.trim() || null });
  }
}

function scoreProfesor(
  _p: AdminUsuarioOption,
  _trabajoAreaIds: Set<number>,
  _trabajoKeywords: string[],
): number {
  // AdminService.listarProfesores no expone áreas, así que el score queda 0 (orden alfabético).
  // Cuando el endpoint exponga áreas se puede completar con intersección + match léxico.
  return 0;
}

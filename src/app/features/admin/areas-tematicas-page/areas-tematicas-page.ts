import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Button } from '@shared/ui/button/button';
import { AreaTematica, ThesaurusOrigen } from '@features/perfil/perfil.models';
import { AdminService } from '../admin.service';
import { AreaTematicaRequest } from '../admin.models';

@Component({
  selector: 'ac-areas-tematicas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, Button],
  templateUrl: './areas-tematicas-page.html',
  styleUrl: './areas-tematicas-page.scss',
})
export class AreasTematicasPage {
  private readonly service = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly THESAURUS: ReadonlyArray<{ value: ThesaurusOrigen; label: string }> = [
    { value: 'CNPQ', label: 'CNPq' },
    { value: 'ACM_CCS', label: 'ACM CCS' },
    { value: 'INTERNO', label: 'Interno' },
  ];

  protected readonly areas = signal<AreaTematica[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionId = signal<number | null>(null);
  protected readonly editId = signal<number | null>(null);
  protected readonly enviando = signal<boolean>(false);

  protected readonly buscador = new FormControl('', { nonNullable: true });
  private readonly filtro = toSignal(this.buscador.valueChanges, { initialValue: '' });

  protected readonly form = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    codigoExterno: new FormControl('', { nonNullable: true }),
    thesaurusOrigen: new FormControl<ThesaurusOrigen>('INTERNO', { nonNullable: true }),
    parentId: new FormControl<number | null>(null),
  });

  protected readonly visibles = computed(() => {
    const q = this.filtro().trim().toLowerCase();
    const list = this.areas();
    if (!q) return list;
    return list.filter(
      (a) => a.nombre.toLowerCase().includes(q) || (a.codigoExterno ?? '').toLowerCase().includes(q));
  });

  /** Áreas elegibles como padre: todas menos la que se está editando. */
  protected readonly parentOpciones = computed(() =>
    this.areas().filter((a) => a.id !== this.editId()));

  constructor() {
    this.cargar();
  }

  private cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .listarAreas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.areas.set(items);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No se pudieron cargar las áreas.');
          this.loading.set(false);
        },
      });
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const req: AreaTematicaRequest = {
      nombre: v.nombre.trim(),
      codigoExterno: v.codigoExterno.trim() || null,
      thesaurusOrigen: v.thesaurusOrigen,
      parentId: v.parentId,
    };
    const id = this.editId();
    const obs = id ? this.service.actualizarArea(id, req) : this.service.crearArea(req);
    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.enviando.set(false);
        this.cancelarEdicion();
        this.cargar();
      },
      error: () => {
        this.enviando.set(false);
        this.error.set('No se pudo guardar el área.');
      },
    });
  }

  protected editar(a: AreaTematica): void {
    this.editId.set(a.id);
    this.form.setValue({
      nombre: a.nombre,
      codigoExterno: a.codigoExterno ?? '',
      thesaurusOrigen: a.thesaurusOrigen,
      parentId: a.parentId,
    });
  }

  protected cancelarEdicion(): void {
    this.editId.set(null);
    this.form.reset({ nombre: '', codigoExterno: '', thesaurusOrigen: 'INTERNO', parentId: null });
  }

  protected toggleActivo(a: AreaTematica): void {
    this.actionId.set(a.id);
    const obs = a.activo ? this.service.desactivarArea(a.id) : this.service.activarArea(a.id);
    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.areas.update((list) =>
          list.map((x) => (x.id === a.id ? { ...x, activo: updated.activo } : x)));
        this.actionId.set(null);
      },
      error: () => {
        this.error.set('No se pudo cambiar el estado.');
        this.actionId.set(null);
      },
    });
  }

  protected thesaurusLabel(t: ThesaurusOrigen): string {
    return this.THESAURUS.find((x) => x.value === t)?.label ?? t;
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { RubricasService } from '@features/rubricas/rubricas.service';
import type { Rubrica } from '@features/rubricas/rubricas.models';

const porNombre = (a: Rubrica, b: Rubrica): number => a.nombre.localeCompare(b.nombre);

@Component({
  selector: 'ac-selector-rubrica-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selector-rubrica-dialog.html',
  styleUrl: './selector-rubrica-dialog.scss',
})
export class SelectorRubricaDialog {
  private readonly rubricas = inject(RubricasService);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = input<boolean>(false);
  /** true en modo "cambiar" (ya hay rúbrica elegida): muestra aviso y botón cancelar. */
  readonly puedeCerrar = input<boolean>(false);

  readonly crear = output<void>();
  readonly usarDefecto = output<void>();
  readonly usarExistente = output<number>();
  readonly cerrar = output<void>();

  protected readonly mias = signal<Rubrica[]>([]);
  protected readonly publicas = signal<Rubrica[]>([]);
  protected readonly cargando = signal<boolean>(false);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open()) {
        if (!el.open) el.showModal();
        this.cargar();
      } else if (el.open) {
        el.close();
      }
    });
  }

  private cargar(): void {
    this.cargando.set(true);
    this.rubricas.buscar('MIAS', 0, 100)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => this.mias.set([...p.content].sort(porNombre)),
        error: () => this.mias.set([]),
      });
    this.rubricas.buscar('PUBLICAS', 0, 100)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => { this.publicas.set([...p.content].sort(porNombre)); this.cargando.set(false); },
        error: () => { this.publicas.set([]); this.cargando.set(false); },
      });
  }
}

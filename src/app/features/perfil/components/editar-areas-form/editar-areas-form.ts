import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Renderer2,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { PerfilService } from '../../perfil.service';
import {
  AreaTematica,
  NivelExperticia,
  UsuarioAreaTematica,
  UsuarioAreasRequest,
} from '../../perfil.models';

interface AreaSelection {
  areaId: number;
  nivelExperticia: NivelExperticia;
}

@Component({
  selector: 'ac-editar-areas-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  templateUrl: './editar-areas-form.html',
  styleUrl: './editar-areas-form.scss',
})
export class EditarAreasForm {
  private readonly perfilService = inject(PerfilService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly doc = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);

  readonly currentAreas = input.required<UsuarioAreaTematica[]>();
  readonly saving = input<boolean>(false);
  readonly serverError = input<string | null>(null);

  readonly closeRequested = output<void>();
  readonly save = output<UsuarioAreasRequest>();

  protected readonly availableAreas = toSignal(this.perfilService.listarAreas(), {
    initialValue: [] as AreaTematica[],
  });

  protected readonly selection = signal<Map<number, NivelExperticia>>(new Map());

  protected readonly selectedCount = computed(() => this.selection().size);

  private readonly hydrate = effect(() => {
    const initial = new Map<number, NivelExperticia>();
    for (const a of this.currentAreas()) {
      initial.set(a.areaId, a.nivelExperticia ?? 'MEDIO');
    }
    this.selection.set(initial);
  });

  protected readonly niveles: NivelExperticia[] = ['BAJO', 'MEDIO', 'ALTO'];

  constructor() {
    fromEvent<KeyboardEvent>(this.doc, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        if (e.key === 'Escape') this.closeRequested.emit();
      });

    this.renderer.addClass(this.doc.body, 'ac-no-scroll');
    this.destroyRef.onDestroy(() => this.renderer.removeClass(this.doc.body, 'ac-no-scroll'));
  }

  protected isSelected(areaId: number): boolean {
    return this.selection().has(areaId);
  }

  protected nivelFor(areaId: number): NivelExperticia {
    return this.selection().get(areaId) ?? 'MEDIO';
  }

  protected nivelLabel(n: NivelExperticia): string {
    switch (n) {
      case 'BAJO':
        return 'Inicial';
      case 'MEDIO':
        return 'Consolidado';
      case 'ALTO':
        return 'Experto';
    }
  }

  protected toggle(areaId: number, checked: boolean): void {
    this.selection.update((m) => {
      const next = new Map(m);
      if (checked) {
        next.set(areaId, next.get(areaId) ?? 'MEDIO');
      } else {
        next.delete(areaId);
      }
      return next;
    });
  }

  protected onCheckboxChange(areaId: number, event: Event): void {
    this.toggle(areaId, (event.target as HTMLInputElement).checked);
  }

  protected onNivelChange(areaId: number, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as NivelExperticia;
    this.selection.update((m) => {
      const next = new Map(m);
      next.set(areaId, value);
      return next;
    });
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeRequested.emit();
  }

  protected onCancel(): void {
    this.closeRequested.emit();
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const items: AreaSelection[] = [];
    for (const [areaId, nivelExperticia] of this.selection().entries()) {
      items.push({ areaId, nivelExperticia });
    }
    this.save.emit({ areas: items });
  }
}

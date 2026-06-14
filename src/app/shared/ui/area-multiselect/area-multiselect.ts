import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, filter } from 'rxjs';

import { AreaTematica } from '@features/perfil/perfil.models';

let uid = 0;

@Component({
  selector: 'ac-area-multiselect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './area-multiselect.html',
  styleUrl: './area-multiselect.scss',
})
export class AreaMultiselect {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly areas = input.required<AreaTematica[]>();
  readonly value = input<number[]>([]);
  readonly valueChange = output<number[]>();
  readonly placeholder = input<string>('Seleccionar áreas');
  readonly disabled = input<boolean>(false);

  protected readonly panelId = `ac-multiselect-${++uid}`;

  protected readonly open = signal<boolean>(false);
  protected readonly searchTerm = signal<string>('');

  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly filteredAreas = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const items = this.areas();
    if (!term) return items;
    return items.filter((a) => a.nombre.toLowerCase().includes(term));
  });

  protected readonly selectedAreas = computed(() => {
    const ids = new Set(this.value());
    return this.areas().filter((a) => ids.has(a.id));
  });

  protected readonly triggerLabel = computed(() => {
    const n = this.value().length;
    if (n === 0) return this.placeholder();
    if (n === 1) return '1 área seleccionada';
    return `${n} áreas seleccionadas`;
  });

  constructor() {
    fromEvent<MouseEvent>(document, 'mousedown')
      .pipe(
        filter(() => this.open()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        if (!this.host.nativeElement.contains(e.target as Node)) {
          this.closePanel();
        }
      });

    effect(() => {
      if (this.open()) {
        queueMicrotask(() => this.searchInputRef()?.nativeElement.focus());
      }
    });
  }

  protected isSelected(id: number): boolean {
    return this.value().includes(id);
  }

  protected toggle(): void {
    if (this.disabled()) return;
    if (this.open()) {
      this.closePanel();
    } else {
      this.open.set(true);
    }
  }

  protected onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchTerm.set(target.value);
  }

  protected toggleOption(id: number): void {
    const cur = this.value();
    const next = cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id];
    this.valueChange.emit(next);
  }

  protected remove(id: number): void {
    this.valueChange.emit(this.value().filter((v) => v !== id));
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closePanel();
    }
  }

  private closePanel(): void {
    this.open.set(false);
    this.searchTerm.set('');
  }
}

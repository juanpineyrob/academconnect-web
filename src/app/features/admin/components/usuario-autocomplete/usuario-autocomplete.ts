import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { Rol } from '@core/auth/models';
import { AdminService } from '../../admin.service';
import { AdminUsuario } from '../../admin.models';

/**
 * Buscador con autocompletado de usuarios por rol. Filtra por nombre o matrícula
 * (server-side) y presenta cada opción como «{matrícula} - {nombre}».
 * Emite el usuario elegido (o null al limpiar / cambiar el texto).
 */
@Component({
  selector: 'ac-usuario-autocomplete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './usuario-autocomplete.html',
  styleUrl: './usuario-autocomplete.scss',
})
export class UsuarioAutocomplete {
  private readonly service = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  readonly rol = input.required<Rol>();
  readonly placeholder = input<string>('Buscar por nombre o matrícula…');
  readonly seleccionar = output<AdminUsuario | null>();

  protected readonly query = new FormControl('', { nonNullable: true });
  protected readonly resultados = signal<AdminUsuario[]>([]);
  protected readonly abierto = signal<boolean>(false);
  protected readonly buscando = signal<boolean>(false);
  protected readonly seleccionado = signal<AdminUsuario | null>(null);

  constructor() {
    this.query.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => this.buscar(q));
  }

  protected display(u: AdminUsuario): string {
    return `${u.matricula ?? '—'} - ${u.nombre}`;
  }

  private buscar(q: string): void {
    // Si ya hay uno elegido y el texto sigue siendo su representación, no buscar.
    const sel = this.seleccionado();
    if (sel && q === this.display(sel)) return;
    // El texto cambió respecto a la selección → deseleccionar.
    if (sel) {
      this.seleccionado.set(null);
      this.seleccionar.emit(null);
    }
    const term = q.trim();
    if (term.length < 2) {
      this.resultados.set([]);
      this.abierto.set(false);
      return;
    }
    this.buscando.set(true);
    this.service
      .buscarUsuarios({ q: term, rol: this.rol(), page: 0, size: 8 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.resultados.set(p.content);
          this.abierto.set(true);
          this.buscando.set(false);
        },
        error: () => {
          this.resultados.set([]);
          this.buscando.set(false);
        },
      });
  }

  protected onFocus(): void {
    if (this.resultados().length > 0) this.abierto.set(true);
  }

  protected onBlur(): void {
    // Pequeño retraso para permitir el click/mousedown sobre una opción.
    setTimeout(() => this.abierto.set(false), 150);
  }

  protected elegir(u: AdminUsuario): void {
    this.seleccionado.set(u);
    this.query.setValue(this.display(u), { emitEvent: false });
    this.resultados.set([]);
    this.abierto.set(false);
    this.seleccionar.emit(u);
  }

  protected limpiar(): void {
    this.query.setValue('', { emitEvent: false });
    this.seleccionado.set(null);
    this.resultados.set([]);
    this.abierto.set(false);
    this.seleccionar.emit(null);
  }
}

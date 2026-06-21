import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';

import { AuthService } from '@core/auth/auth.service';
import { RubricasService } from '../rubricas.service';
import type { Rubrica } from '../rubricas.models';

@Component({
  selector: 'ac-rubricas-lista',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe],
  template: `
    <section class="lista">
      <header class="lista__head">
        <h1 class="t-h2">Rúbricas</h1>
        <a class="lista__nueva" routerLink="/rubricas/nueva">Nueva rúbrica</a>
      </header>

      <div class="lista__tabs" role="tablist">
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'mias'"
                class="lista__tab" [class.lista__tab--on]="tab() === 'mias'" (click)="tab.set('mias')">
          Mías ({{ mias().length }})
        </button>
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'publicas'"
                class="lista__tab" [class.lista__tab--on]="tab() === 'publicas'" (click)="tab.set('publicas')">
          Públicas ({{ publicas().length }})
        </button>
      </div>

      @if (loading()) {
        <p>Cargando…</p>
      } @else {
        @let visibles = tab() === 'mias' ? mias() : publicas();
        @if (visibles.length === 0) {
          <p class="lista__vacio">No hay rúbricas en esta vista.</p>
        }
        <ul class="lista__grid">
          @for (r of visibles; track r.id) {
            <li class="rubcard" [class.rubcard--inactiva]="!r.activo">
              <div class="rubcard__top">
                <span class="rubcard__nombre">{{ r.nombre }}</span>
                <span class="rubcard__vis">{{ r.visibilidad === 'PUBLICO' ? 'Pública' : 'Privada' }}</span>
              </div>
              <p class="rubcard__meta">
                {{ r.criterios.length }} criterios · umbral {{ r.umbralAprobacion | number: '1.0-2' }}
                @if (r.autorNombre) { · {{ r.autorNombre }} }
              </p>
              <div class="rubcard__acciones">
                @if (esMia(r)) {
                  <a [routerLink]="['/rubricas', r.id, 'editar']">Editar</a>
                  <button type="button" (click)="desactivar(r)">Desactivar</button>
                } @else {
                  <a [routerLink]="['/rubricas', r.id, 'editar']">Ver</a>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    .lista { max-width: 960px; margin: 0 auto; padding: var(--sp-5) var(--sp-4) var(--sp-7); }
    .lista__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-4); }
    .lista__nueva { background: var(--c-primary); color: var(--c-text-on-primary); padding: var(--sp-2) var(--sp-4); border-radius: var(--r-md); text-decoration: none; }
    .lista__tabs { display: flex; gap: var(--sp-2); margin-bottom: var(--sp-4); border-bottom: 1px solid var(--c-border); }
    .lista__tab { background: none; border: none; padding: var(--sp-2) var(--sp-3); cursor: pointer; color: var(--c-text-muted); border-bottom: 2px solid transparent; }
    .lista__tab--on { color: var(--c-text); border-bottom-color: var(--c-accent); font-weight: var(--fw-semibold); }
    .lista__grid { list-style: none; padding: 0; display: grid; gap: var(--sp-3); grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
    .rubcard { border: 1px solid var(--c-border); border-radius: var(--r-md); padding: var(--sp-4); background: var(--c-surface); display: grid; gap: var(--sp-2); }
    .rubcard--inactiva { opacity: 0.6; }
    .rubcard__top { display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-2); }
    .rubcard__nombre { font-weight: var(--fw-semibold); }
    .rubcard__vis { font-family: var(--ff-sans); font-size: var(--fs-caption); font-weight: var(--fw-semibold); color: var(--c-accent); background: var(--c-accent-soft); border-radius: var(--r-sm); padding: 2px var(--sp-2); }
    .rubcard__meta { margin: 0; font-size: var(--fs-body-sm); color: var(--c-text-muted); }
    .rubcard__acciones { display: flex; gap: var(--sp-3); font-size: var(--fs-body-sm); }
    .rubcard__acciones button { background: none; border: none; color: var(--c-state-rechazado); cursor: pointer; padding: 0; }
  `],
})
export class ListaPage {
  private readonly service = inject(RubricasService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tab = signal<'mias' | 'publicas'>('mias');
  protected readonly loading = signal(true);
  private readonly rubricas = signal<Rubrica[]>([]);

  protected readonly mias = computed(() => this.rubricas().filter((r) => this.esMia(r)));
  protected readonly publicas = computed(() => this.rubricas().filter((r) => !this.esMia(r)));

  constructor() {
    this.cargar();
  }

  protected esMia(r: Rubrica): boolean {
    return r.autorId === this.auth.currentUser()?.userId;
  }

  private cargar(): void {
    this.loading.set(true);
    this.service.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (rs) => { this.rubricas.set(rs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  protected desactivar(r: Rubrica): void {
    this.service.desactivar(r.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.cargar(),
    });
  }
}

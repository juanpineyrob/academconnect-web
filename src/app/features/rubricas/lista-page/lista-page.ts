import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';

import { AuthService } from '@core/auth/auth.service';
import { Button } from '@shared/ui/button/button';
import { RubricasService } from '../rubricas.service';
import type { Rubrica } from '../rubricas.models';

const PAGE_SIZE = 12;

@Component({
  selector: 'ac-rubricas-lista',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, Button],
  template: `
    <section class="lista">
      <header class="lista__head">
        <h1 class="t-h2">Rúbricas</h1>
        <a class="lista__nueva" routerLink="/rubricas/nueva">Nueva rúbrica</a>
      </header>

      <div class="lista__tabs" role="tablist">
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'mias'"
                class="lista__tab" [class.lista__tab--on]="tab() === 'mias'" (click)="cambiarTab('mias')">
          Mías
        </button>
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'publicas'"
                class="lista__tab" [class.lista__tab--on]="tab() === 'publicas'" (click)="cambiarTab('publicas')">
          Públicas
        </button>
      </div>

      @if (loading()) {
        <p>Cargando…</p>
      } @else if (rubricas().length === 0) {
        <p class="lista__vacio">No hay rúbricas en esta vista.</p>
      } @else {
        <ul class="lista__grid">
          @for (r of rubricas(); track r.id) {
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

        @if (totalPages() > 1) {
          <nav class="lista__pager" aria-label="Paginación">
            <ac-button size="sm" variant="ghost" [disabled]="first() || loading()" (click)="paginaAnterior()">← Anterior</ac-button>
            <span class="lista__pageinfo">Página {{ page() + 1 }} de {{ totalPages() }} · {{ totalElements() }} rúbricas</span>
            <ac-button size="sm" variant="ghost" [disabled]="last() || loading()" (click)="paginaSiguiente()">Siguiente →</ac-button>
          </nav>
        }
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
    .lista__pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); flex-wrap: wrap; margin-top: var(--sp-4); }
    .lista__pageinfo { font-family: var(--ff-sans); font-size: var(--fs-body-sm); color: var(--c-text-muted); font-variant-numeric: tabular-nums; }
  `],
})
export class ListaPage {
  private readonly service = inject(RubricasService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tab = signal<'mias' | 'publicas'>('mias');
  protected readonly loading = signal(true);
  protected readonly rubricas = signal<Rubrica[]>([]);

  protected readonly page = signal(0);
  protected readonly totalPages = signal(0);
  protected readonly totalElements = signal(0);
  protected readonly first = signal(true);
  protected readonly last = signal(true);

  constructor() {
    this.cargar();
  }

  protected esMia(r: Rubrica): boolean {
    return r.autorId === this.auth.currentUser()?.userId;
  }

  protected cambiarTab(t: 'mias' | 'publicas'): void {
    if (this.tab() === t) return;
    this.tab.set(t);
    this.page.set(0);
    this.cargar();
  }

  protected paginaAnterior(): void {
    if (this.first() || this.loading()) return;
    this.page.update((p) => p - 1);
    this.cargar();
  }

  protected paginaSiguiente(): void {
    if (this.last() || this.loading()) return;
    this.page.update((p) => p + 1);
    this.cargar();
  }

  private cargar(): void {
    this.loading.set(true);
    const scope = this.tab() === 'mias' ? 'MIAS' : 'PUBLICAS';
    this.service.buscar(scope, this.page(), PAGE_SIZE).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => {
        if (p.content.length === 0 && p.number > 0) {
          this.page.set(p.number - 1);
          this.cargar();
          return;
        }
        this.rubricas.set(p.content);
        this.totalPages.set(p.totalPages);
        this.totalElements.set(p.totalElements);
        this.first.set(p.first);
        this.last.set(p.last);
        this.page.set(p.number);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected desactivar(r: Rubrica): void {
    this.service.desactivar(r.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.cargar(),
    });
  }
}

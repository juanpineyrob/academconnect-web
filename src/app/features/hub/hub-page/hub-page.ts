import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { Page } from '@core/http/page';
import { AreaTematica, Perfil } from '@features/perfil/perfil.models';
import { PerfilService } from '@features/perfil/perfil.service';
import { RepositorioService } from '@features/repositorio/repositorio.service';
import {
  FiltrosRepositorio,
  FiltrosState,
} from '@features/repositorio/components/filtros-repositorio/filtros-repositorio';
import { TIPO_LABEL, TrabajoListItem } from '@features/repositorio/repositorio.models';
import { HubService } from '../hub.service';
import { compareTrabajos } from '../ranking';

@Component({
  selector: 'ac-hub-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, DatePipe, FiltrosRepositorio],
  templateUrl: './hub-page.html',
  styleUrl: './hub-page.scss',
})
export class HubPage {
  private readonly hubService = inject(HubService);
  private readonly perfilService = inject(PerfilService);
  private readonly repo = inject(RepositorioService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly filtros = signal<FiltrosState>({ areaIds: [], tipo: null, anios: [] });
  protected readonly page = signal<number>(0);
  protected readonly results = signal<Page<TrabajoListItem> | null>(null);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly areas = signal<AreaTematica[]>([]);
  protected readonly perfil = signal<Perfil | null>(null);
  protected readonly tipoLabel = TIPO_LABEL;

  protected readonly ranked = computed<TrabajoListItem[]>(() => {
    const r = this.results();
    if (!r) return [];
    const p = this.perfil();
    return [...r.content].sort((a, b) => compareTrabajos(a, b, p));
  });

  constructor() {
    this.repo.listarAreas()
      .pipe(catchError(() => of<AreaTematica[]>([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((as) => this.areas.set(as));

    this.perfilService.getMiPerfil()
      .pipe(catchError(() => of<Perfil | null>(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => this.perfil.set(p));

    effect(() => {
      const f = this.filtros();
      const pg = this.page();
      this.loading.set(true);
      this.error.set(null);
      this.hubService.buscarAbiertos({
        areaId: f.areaIds, tipo: f.tipo, anio: f.anios, page: pg, size: 12,
      }).pipe(
        catchError((err: HttpErrorResponse) => {
          this.error.set(err.status === 0 ? 'Sin conexión.' : 'No se pudieron cargar las necesidades.');
          return of<Page<TrabajoListItem> | null>(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe((res) => {
        this.results.set(res);
        this.loading.set(false);
      });
    });
  }

  protected onFiltrosChange(next: FiltrosState): void { this.filtros.set(next); this.page.set(0); }
  protected onClearFiltros(): void { this.filtros.set({ areaIds: [], tipo: null, anios: [] }); this.page.set(0); }
  protected nextPage(): void { if (!this.results()?.last) this.page.update((p) => p + 1); }
  protected prevPage(): void { if (!this.results()?.first) this.page.update((p) => Math.max(0, p - 1)); }
}

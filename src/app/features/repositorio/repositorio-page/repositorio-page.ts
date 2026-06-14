import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';

import { Page } from '@core/http/page';
import { Button } from '@shared/ui/button/button';
import { AreaTematica, TipoTrabajo } from '@features/perfil/perfil.models';
import {
  FiltrosRepositorio,
  FiltrosState,
} from '../components/filtros-repositorio/filtros-repositorio';
import { TrabajoCard } from '../components/trabajo-card/trabajo-card';
import { TrabajoListItem, TrabajoSearchParams } from '../repositorio.models';
import { RepositorioService } from '../repositorio.service';

const PAGE_SIZE = 12;
const DEFAULT_SORT = 'createdAt,desc';
const MIN_QUERY_LENGTH = 3;

@Component({
  selector: 'ac-repositorio-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, FiltrosRepositorio, TrabajoCard],
  templateUrl: './repositorio-page.html',
  styleUrl: './repositorio-page.scss',
})
export class RepositorioPage {
  private readonly service = inject(RepositorioService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });

  protected readonly filtros = signal<FiltrosState>({
    areaIds: [],
    tipo: null,
    anios: [],
  });

  protected readonly query = signal<string>('');
  protected readonly page = signal<number>(0);
  protected readonly sort = signal<string>(DEFAULT_SORT);

  protected readonly results = signal<Page<TrabajoListItem> | null>(null);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);

  protected readonly areas = signal<AreaTematica[]>([]);
  protected readonly areasLoading = signal<boolean>(true);

  protected readonly totalResultados = computed(() => this.results()?.totalElements ?? 0);
  protected readonly hasResults = computed(() => (this.results()?.content.length ?? 0) > 0);
  protected readonly isFirstPage = computed(() => this.results()?.first ?? true);
  protected readonly isLastPage = computed(() => this.results()?.last ?? true);
  protected readonly currentPage = computed(() => (this.results()?.number ?? this.page()) + 1);
  protected readonly totalPaginas = computed(() => Math.max(1, this.results()?.totalPages ?? 1));

  protected readonly minQueryLength = MIN_QUERY_LENGTH;
  protected readonly effectiveQuery = computed(() => {
    const trimmed = this.query().trim();
    return trimmed.length >= MIN_QUERY_LENGTH ? trimmed : null;
  });
  protected readonly shortQueryHint = computed(() => {
    const trimmed = this.query().trim();
    return trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH;
  });

  private readonly searchInput$ = new Subject<TrabajoSearchParams>();

  constructor() {
    this.hydrateFromQuery();
    this.loadAreas();

    this.searchControl.valueChanges
      .pipe(debounceTime(280), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => {
        this.query.set(q);
        this.page.set(0);
      });

    effect(() => {
      const params: TrabajoSearchParams = {
        q: this.effectiveQuery(),
        areaId: this.filtros().areaIds,
        anio: this.filtros().anios,
        tipo: this.filtros().tipo,
        page: this.page(),
        size: PAGE_SIZE,
        sort: this.sort(),
      };
      this.searchInput$.next(params);
      this.syncUrl(params);
    });

    this.searchInput$
      .pipe(
        startWith<TrabajoSearchParams>({
          q: this.effectiveQuery(),
          areaId: this.filtros().areaIds,
          anio: this.filtros().anios,
          tipo: this.filtros().tipo,
          page: this.page(),
          size: PAGE_SIZE,
          sort: this.sort(),
        }),
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap((params) =>
          this.service.buscar(params).pipe(
            catchError((err: HttpErrorResponse) => {
              this.error.set(this.mapError(err));
              return of<Page<TrabajoListItem> | null>(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.results.set(res);
        this.loading.set(false);
      });

    toObservable(this.filtros)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.page.set(0));
  }

  protected onFiltrosChange(next: FiltrosState): void {
    this.filtros.set(next);
  }

  protected onClearFiltros(): void {
    this.filtros.set({ areaIds: [], tipo: null, anios: [] });
  }

  protected onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.sort.set(value);
    this.page.set(0);
  }

  protected nextPage(): void {
    if (!this.isLastPage()) this.page.update((p) => p + 1);
  }

  protected prevPage(): void {
    if (!this.isFirstPage()) this.page.update((p) => Math.max(0, p - 1));
  }

  private loadAreas(): void {
    this.areasLoading.set(true);
    this.service
      .listarAreas()
      .pipe(
        catchError(() => of<AreaTematica[]>([])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((as) => {
        this.areas.set(as);
        this.areasLoading.set(false);
      });
  }

  private hydrateFromQuery(): void {
    const qp = this.route.snapshot.queryParamMap;
    const q = qp.get('q') ?? '';
    if (q) {
      this.searchControl.setValue(q, { emitEvent: false });
      this.query.set(q);
    }
    const tipo = qp.get('tipo') as TipoTrabajo | null;
    const areaIds = qp.getAll('areaId').map((v) => Number(v)).filter((n) => !Number.isNaN(n));
    const anios = qp.getAll('anio').map((v) => Number(v)).filter((n) => !Number.isNaN(n));
    this.filtros.set({ areaIds, tipo, anios });
    const sort = qp.get('sort');
    if (sort) this.sort.set(sort);
    const page = Number(qp.get('page'));
    if (!Number.isNaN(page) && page > 0) this.page.set(page);
  }

  private syncUrl(params: TrabajoSearchParams): void {
    const queryParams: Record<string, string | string[] | null> = {
      q: params.q ?? null,
      tipo: params.tipo ?? null,
      areaId: params.areaId && params.areaId.length > 0 ? params.areaId.map(String) : null,
      anio: params.anio && params.anio.length > 0 ? params.anio.map(String) : null,
      sort: params.sort && params.sort !== DEFAULT_SORT ? params.sort : null,
      page: (params.page ?? 0) > 0 ? String(params.page) : null,
    };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'No pudimos conectarnos con el servidor.';
    if (err.status >= 500) return 'El servidor tuvo un problema. Probá nuevamente.';
    return 'No se pudieron cargar los trabajos.';
  }
}

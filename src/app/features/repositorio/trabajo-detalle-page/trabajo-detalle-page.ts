import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { environment } from '@env/environment';
import { Badge } from '@shared/ui/badge/badge';
import { ESTADO_LABEL, TIPO_LABEL, TrabajoListItem } from '../repositorio.models';
import { RepositorioService } from '../repositorio.service';

@Component({
  selector: 'ac-trabajo-detalle-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, RouterLink],
  templateUrl: './trabajo-detalle-page.html',
  styleUrl: './trabajo-detalle-page.scss',
})
export class TrabajoDetallePage {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(RepositorioService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly trabajo = signal<TrabajoListItem | null>(null);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);

  protected readonly tipoLabel = computed(() =>
    this.trabajo() ? TIPO_LABEL[this.trabajo()!.tipo] ?? this.trabajo()!.tipo : '',
  );
  protected readonly estadoLabel = computed(() =>
    this.trabajo() ? ESTADO_LABEL[this.trabajo()!.estado] ?? this.trabajo()!.estado : '',
  );
  protected readonly anio = computed(() => {
    const t = this.trabajo();
    if (!t) return '';
    return new Date(t.evaluadoEn ?? t.createdAt).getFullYear();
  });

  protected readonly archivoHref = computed(() => {
    const t = this.trabajo();
    if (!t || !t.archivoStorageKey) return null;
    return `${environment.apiBase}/api/trabajos/${t.id}/archivo`;
  });

  protected readonly archivoFilename = computed(() => {
    const t = this.trabajo();
    if (!t || !t.archivoStorageKey) return null;
    const slug = t.titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    return `${slug}.pdf`;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      const id = Number(pm.get('id'));
      if (Number.isNaN(id)) {
        this.error.set('Identificador inválido.');
        this.loading.set(false);
        return;
      }
      this.loadTrabajo(id);
    });
  }

  protected estadoBadgeState(estado: string): 'aprobado' | 'revision' | 'rechazado' | 'borrador' | 'enviado' | 'observado' {
    switch (estado) {
      case 'APROBADO':
        return 'aprobado';
      case 'EN_EVALUACION':
        return 'revision';
      case 'RECHAZADO':
      case 'CANCELADO':
        return 'rechazado';
      case 'EN_DESARROLLO':
        return 'observado';
      case 'ABIERTO':
        return 'enviado';
      default:
        return 'borrador';
    }
  }

  private loadTrabajo(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => {
          this.trabajo.set(t);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          if (err.status === 404) this.error.set('No encontramos este trabajo.');
          else if (err.status === 0) this.error.set('No pudimos conectarnos con el servidor.');
          else this.error.set('No se pudo cargar el trabajo.');
        },
      });
  }
}

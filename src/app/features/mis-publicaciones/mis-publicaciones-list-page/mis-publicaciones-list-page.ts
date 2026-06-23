import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Button } from '@shared/ui/button/button';
import { AuthService } from '@core/auth/auth.service';
import {
  ESTADO_LABEL,
  TIPO_LABEL,
  TrabajoListItem,
} from '@features/repositorio/repositorio.models';
import { MisPublicacionesService } from '../mis-publicaciones.service';

type Tab = 'TODAS' | 'BORRADOR' | 'ABIERTO' | 'EN_DESARROLLO';
type Tono = 'aprobado' | 'rechazado' | 'revision' | 'enviado' | 'borrador';

const PAGE_SIZE = 10;

@Component({
  selector: 'ac-mis-publicaciones-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, DatePipe, DecimalPipe],
  templateUrl: './mis-publicaciones-list-page.html',
  styleUrl: './mis-publicaciones-list-page.scss',
})
export class MisPublicacionesListPage {
  private readonly service = inject(MisPublicacionesService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly TABS: ReadonlyArray<{ key: Tab; label: string }> = [
    { key: 'TODAS', label: 'Todas' },
    { key: 'BORRADOR', label: 'Borradores' },
    { key: 'ABIERTO', label: 'Abiertos' },
    { key: 'EN_DESARROLLO', label: 'En desarrollo' },
  ];

  protected readonly trabajos = signal<TrabajoListItem[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly tab = signal<Tab>('TODAS');
  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly estadoLabel = ESTADO_LABEL;

  protected readonly page = signal<number>(0);
  protected readonly totalPages = signal<number>(0);
  protected readonly totalElements = signal<number>(0);
  protected readonly first = signal<boolean>(true);
  protected readonly last = signal<boolean>(true);

  private readonly ESTADO_TONO: Record<string, Tono> = {
    BORRADOR: 'borrador',
    ABIERTO: 'enviado',
    EN_DESARROLLO: 'revision',
    EN_EVALUACION: 'revision',
    APROBADO: 'aprobado',
    RECHAZADO: 'rechazado',
    CANCELADO: 'borrador',
  };

  protected tono(estado: string): Tono {
    return this.ESTADO_TONO[estado] ?? 'borrador';
  }

  constructor() {
    this.cargar();
  }

  protected cambiarTab(t: Tab): void {
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

  protected cargar(): void {
    const me = this.auth.currentUser();
    if (!me) { this.loading.set(false); return; }
    this.loading.set(true);
    this.error.set(null);
    const estado = this.tab() === 'TODAS' ? undefined : this.tab();
    this.service.listarPorOrientador(me.userId, estado, this.page(), PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          if (p.content.length === 0 && p.number > 0) {
            this.page.set(p.number - 1);
            this.cargar();
            return;
          }
          this.trabajos.set(p.content);
          this.totalPages.set(p.totalPages);
          this.totalElements.set(p.totalElements);
          this.first.set(p.first);
          this.last.set(p.last);
          this.page.set(p.number);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.error.set(err.status === 0 ? 'Sin conexión.' : 'No se pudieron cargar tus publicaciones.');
          this.loading.set(false);
        },
      });
  }
}

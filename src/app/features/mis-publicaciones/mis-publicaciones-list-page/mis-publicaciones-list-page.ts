import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { AuthService } from '@core/auth/auth.service';
import {
  ESTADO_LABEL,
  TIPO_LABEL,
  TrabajoListItem,
} from '@features/repositorio/repositorio.models';
import { MisPublicacionesService } from '../mis-publicaciones.service';

@Component({
  selector: 'ac-mis-publicaciones-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, DatePipe],
  templateUrl: './mis-publicaciones-list-page.html',
  styleUrl: './mis-publicaciones-list-page.scss',
})
export class MisPublicacionesListPage {
  private readonly service = inject(MisPublicacionesService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly trabajos = signal<TrabajoListItem[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly estadoLabel = ESTADO_LABEL;

  protected readonly borradores = computed(() => this.trabajos().filter((t) => t.estado === 'BORRADOR'));
  protected readonly abiertos = computed(() => this.trabajos().filter((t) => t.estado === 'ABIERTO'));
  protected readonly enDesarrollo = computed(() => this.trabajos().filter((t) => t.estado === 'EN_DESARROLLO'));
  protected readonly otros = computed(() => this.trabajos().filter(
      (t) => !['BORRADOR', 'ABIERTO', 'EN_DESARROLLO'].includes(t.estado)));

  constructor() {
    const me = this.auth.currentUser();
    if (!me) { this.loading.set(false); return; }
    this.service.listarPorOrientador(me.userId)
      .pipe(
        catchError((err: HttpErrorResponse) => {
          this.error.set(err.status === 0 ? 'Sin conexión.' : 'No se pudieron cargar tus publicaciones.');
          return of({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 0, first: true, last: true });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        this.trabajos.set(page.content);
        this.loading.set(false);
      });
  }
}

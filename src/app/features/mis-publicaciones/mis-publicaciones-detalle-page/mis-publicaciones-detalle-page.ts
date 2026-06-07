import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { isProblemDetail } from '@core/http/problem-detail';
import {
  ESTADO_LABEL,
  TIPO_LABEL,
  TrabajoListItem,
} from '@features/repositorio/repositorio.models';
import { MisPublicacionesService } from '../mis-publicaciones.service';
import { SolicitudVinculacionService } from '../solicitud-vinculacion.service';
import { DuracionPublicacion } from '../mis-publicaciones.models';
import { SolicitudVinculacion } from '../solicitud-vinculacion.models';

@Component({
  selector: 'ac-mis-publicaciones-detalle-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Card, DatePipe],
  templateUrl: './mis-publicaciones-detalle-page.html',
  styleUrl: './mis-publicaciones-detalle-page.scss',
})
export class MisPublicacionesDetallePage {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(MisPublicacionesService);
  private readonly solicitudService = inject(SolicitudVinculacionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly trabajo = signal<TrabajoListItem | null>(null);
  protected readonly solicitudes = signal<SolicitudVinculacion[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionMessage = signal<string | null>(null);
  protected readonly publicarOpen = signal<boolean>(false);
  protected readonly duracion = signal<DuracionPublicacion>(30);
  protected readonly publicando = signal<boolean>(false);
  protected readonly cerrando = signal<boolean>(false);
  protected readonly actionSolicitudId = signal<number | null>(null);

  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly estadoLabel = ESTADO_LABEL;
  protected readonly duraciones: DuracionPublicacion[] = [7, 15, 30, 60];

  protected readonly pendientes = computed(() => this.solicitudes().filter((s) => s.estado === 'PENDIENTE'));

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    forkJoin({
      trabajo: this.service.getById(id).pipe(
        catchError((err: HttpErrorResponse) => { this.error.set(this.mapError(err)); return of(null); })),
      solicitudes: this.solicitudService.listarPorTrabajo(id).pipe(
        catchError(() => of<SolicitudVinculacion[]>([]))),
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ trabajo, solicitudes }) => {
        this.trabajo.set(trabajo);
        this.solicitudes.set(solicitudes);
        this.loading.set(false);
      });
  }

  protected openPublicar(): void { this.publicarOpen.set(true); }
  protected closePublicar(): void { this.publicarOpen.set(false); }
  protected setDuracion(d: DuracionPublicacion): void { this.duracion.set(d); }

  protected confirmPublicar(): void {
    const t = this.trabajo();
    if (!t) return;
    this.publicando.set(true);
    this.service.publicar(t.id, { duracionDias: this.duracion() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.trabajo.set(updated);
          this.publicando.set(false);
          this.publicarOpen.set(false);
          this.actionMessage.set('Publicación creada.');
        },
        error: (err: HttpErrorResponse) => { this.publicando.set(false); this.error.set(this.mapError(err)); },
      });
  }

  protected cerrarTrabajo(): void {
    const t = this.trabajo();
    if (!t) return;
    if (!confirm('¿Cerrar esta publicación? Todas las solicitudes pendientes serán rechazadas.')) return;
    this.cerrando.set(true);
    this.service.cerrar(t.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.trabajo.set(updated);
          this.cerrando.set(false);
          this.solicitudService.listarPorTrabajo(t.id)
            .pipe(catchError(() => of<SolicitudVinculacion[]>([])), takeUntilDestroyed(this.destroyRef))
            .subscribe((ss) => this.solicitudes.set(ss));
          this.actionMessage.set('Publicación cerrada.');
        },
        error: (err: HttpErrorResponse) => { this.cerrando.set(false); this.error.set(this.mapError(err)); },
      });
  }

  protected aceptar(s: SolicitudVinculacion): void {
    this.actionSolicitudId.set(s.id);
    this.solicitudService.aceptar(s.id, { respuesta: null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.solicitudes.update((prev) => prev.map((x) => x.id === updated.id ? updated : x));
          this.service.getById(s.trabajoId)
            .pipe(catchError(() => of<TrabajoListItem | null>(null)), takeUntilDestroyed(this.destroyRef))
            .subscribe((t) => { if (t) this.trabajo.set(t); });
          this.actionSolicitudId.set(null);
        },
        error: (err: HttpErrorResponse) => { this.actionSolicitudId.set(null); this.error.set(this.mapError(err)); },
      });
  }

  protected rechazar(s: SolicitudVinculacion): void {
    this.actionSolicitudId.set(s.id);
    this.solicitudService.rechazar(s.id, { respuesta: null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.solicitudes.update((prev) => prev.map((x) => x.id === updated.id ? updated : x));
          this.actionSolicitudId.set(null);
        },
        error: (err: HttpErrorResponse) => { this.actionSolicitudId.set(null); this.error.set(this.mapError(err)); },
      });
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Sin conexión.';
    if (err.status === 404) return 'Trabajo no encontrado.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return 'No se pudo completar la acción.';
  }
}

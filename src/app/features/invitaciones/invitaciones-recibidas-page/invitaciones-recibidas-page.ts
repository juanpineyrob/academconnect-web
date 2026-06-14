import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { isProblemDetail } from '@core/http/problem-detail';
import { InvitacionOrientacionService } from '@features/mis-trabajos/invitacion-orientacion.service';
import { InvitacionOrientacion } from '@features/mis-trabajos/invitacion-orientacion.models';

type Filtro = 'PENDIENTE' | 'HISTORICO';

@Component({
  selector: 'ac-invitaciones-recibidas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Card],
  templateUrl: './invitaciones-recibidas-page.html',
  styleUrl: './invitaciones-recibidas-page.scss',
})
export class InvitacionesRecibidasPage {
  private readonly service = inject(InvitacionOrientacionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly invitaciones = signal<InvitacionOrientacion[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionId = signal<number | null>(null);
  protected readonly filtro = signal<Filtro>('PENDIENTE');
  protected readonly respuestas = signal<Map<number, string>>(new Map());

  protected respuestaTexto(id: number): string {
    return this.respuestas().get(id) ?? '';
  }

  protected onRespuestaInput(id: number, value: string): void {
    this.respuestas.update((prev) => {
      const next = new Map(prev);
      if (value) next.set(id, value); else next.delete(id);
      return next;
    });
  }

  private clearRespuesta(id: number): void {
    this.respuestas.update((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  private extractRespuesta(id: number): string | null {
    const raw = this.respuestas().get(id)?.trim();
    return raw && raw.length > 0 ? raw : null;
  }

  protected readonly visibles = computed(() => {
    const f = this.filtro();
    return this.invitaciones().filter((i) =>
      f === 'PENDIENTE' ? i.estado === 'PENDIENTE' : i.estado !== 'PENDIENTE');
  });

  constructor() {
    this.cargar();
  }

  protected setFiltro(f: Filtro): void {
    this.filtro.set(f);
  }

  protected aceptar(i: InvitacionOrientacion): void {
    this.actionId.set(i.id);
    const respuesta = this.extractRespuesta(i.id);
    this.service.aceptar(i.id, { respuesta })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.invitaciones.update((prev) => prev.map((x) => x.id === updated.id ? updated : x));
          this.clearRespuesta(i.id);
          this.actionId.set(null);
        },
        error: (err: HttpErrorResponse) => { this.actionId.set(null); this.error.set(this.mapError(err)); },
      });
  }

  protected rechazar(i: InvitacionOrientacion): void {
    this.actionId.set(i.id);
    const respuesta = this.extractRespuesta(i.id);
    this.service.rechazar(i.id, { respuesta })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.invitaciones.update((prev) => prev.map((x) => x.id === updated.id ? updated : x));
          this.clearRespuesta(i.id);
          this.actionId.set(null);
        },
        error: (err: HttpErrorResponse) => { this.actionId.set(null); this.error.set(this.mapError(err)); },
      });
  }

  private cargar(): void {
    this.service.listarRecibidas()
      .pipe(
        catchError((err: HttpErrorResponse) => { this.error.set(this.mapError(err)); return of<InvitacionOrientacion[]>([]); }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => { this.invitaciones.set(items); this.loading.set(false); });
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Sin conexión.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return 'No se pudo completar la acción.';
  }
}

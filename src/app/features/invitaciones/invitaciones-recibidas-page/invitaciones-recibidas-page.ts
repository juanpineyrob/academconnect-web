import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { isProblemDetail } from '@core/http/problem-detail';
import { InvitacionOrientacionService } from '@features/mis-trabajos/invitacion-orientacion.service';
import { InvitacionOrientacion } from '@features/mis-trabajos/invitacion-orientacion.models';

type Filtro = 'PENDIENTE' | 'HISTORICO';

const PAGE_SIZE = 10;

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

  protected readonly page = signal<number>(0);
  protected readonly totalPages = signal<number>(0);
  protected readonly totalElements = signal<number>(0);
  protected readonly first = signal<boolean>(true);
  protected readonly last = signal<boolean>(true);

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

  constructor() {
    this.cargar();
  }

  protected setFiltro(f: Filtro): void {
    if (this.filtro() === f) return;
    this.filtro.set(f);
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

  protected aceptar(i: InvitacionOrientacion): void {
    this.actionId.set(i.id);
    const respuesta = this.extractRespuesta(i.id);
    this.service.aceptar(i.id, { respuesta })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.clearRespuesta(i.id);
          this.actionId.set(null);
          this.cargar();
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
        next: () => {
          this.clearRespuesta(i.id);
          this.actionId.set(null);
          this.cargar();
        },
        error: (err: HttpErrorResponse) => { this.actionId.set(null); this.error.set(this.mapError(err)); },
      });
  }

  private cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    const estado = this.filtro() === 'PENDIENTE' ? 'PENDIENTE' : undefined;
    this.service.listarRecibidas(estado, this.page(), PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          if (p.content.length === 0 && p.number > 0) {
            this.page.set(p.number - 1);
            this.cargar();
            return;
          }
          this.invitaciones.set(p.content);
          this.totalPages.set(p.totalPages);
          this.totalElements.set(p.totalElements);
          this.first.set(p.first);
          this.last.set(p.last);
          this.page.set(p.number);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => { this.error.set(this.mapError(err)); this.loading.set(false); },
      });
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Sin conexión.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return 'No se pudo completar la acción.';
  }
}

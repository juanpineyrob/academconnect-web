import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import {
  ESTADO_LABEL,
  TIPO_LABEL,
  TrabajoListItem,
} from '@features/repositorio/repositorio.models';
import { isProblemDetail } from '@core/http/problem-detail';
import { InvitarOrientadorForm } from '../components/invitar-orientador-form/invitar-orientador-form';
import { InvitacionOrientacionService } from '../invitacion-orientacion.service';
import { InvitacionOrientacion } from '../invitacion-orientacion.models';
import { MisTrabajosService } from '../mis-trabajos.service';

@Component({
  selector: 'ac-mis-trabajos-detalle-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Card, InvitarOrientadorForm],
  templateUrl: './mis-trabajos-detalle-page.html',
  styleUrl: './mis-trabajos-detalle-page.scss',
})
export class MisTrabajosDetallePage {
  private readonly route = inject(ActivatedRoute);
  private readonly trabajosService = inject(MisTrabajosService);
  private readonly invitacionService = inject(InvitacionOrientacionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly trabajo = signal<TrabajoListItem | null>(null);
  protected readonly invitaciones = signal<InvitacionOrientacion[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly submittingInv = signal<boolean>(false);
  protected readonly actionMessage = signal<string | null>(null);

  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly estadoLabel = ESTADO_LABEL;
  protected readonly estadoInvLabel: Record<string, string> = {
    PENDIENTE: 'Pendiente',
    ACEPTADA: 'Aceptada',
    RECHAZADA: 'Rechazada',
    CANCELADA: 'Cancelada',
  };

  protected readonly invitacionPendiente = computed(() =>
    this.invitaciones().find((i) => i.estado === 'PENDIENTE') ?? null);

  protected readonly puedeInvitar = computed(() => {
    const t = this.trabajo();
    return !!t && t.estado === 'BORRADOR' && t.orientadorId == null && this.invitacionPendiente() == null;
  });

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    forkJoin({
      trabajo: this.trabajosService.getById(id).pipe(
        catchError((err: HttpErrorResponse) => { this.error.set(this.mapError(err)); return of(null); })),
      invitaciones: this.invitacionService.listarPorTrabajo(id).pipe(
        catchError(() => of<InvitacionOrientacion[]>([]))),
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ trabajo, invitaciones }) => {
        this.trabajo.set(trabajo);
        this.invitaciones.set(invitaciones);
        this.loading.set(false);
      });
  }

  protected onInvitar(payload: { profesorId: number; motivo: string | null }): void {
    const t = this.trabajo();
    if (!t) return;
    this.submittingInv.set(true);
    this.actionMessage.set(null);
    this.invitacionService
      .enviar({ trabajoId: t.id, profesorId: payload.profesorId, motivo: payload.motivo })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (inv) => {
          this.invitaciones.update((prev) => [inv, ...prev]);
          this.submittingInv.set(false);
          this.actionMessage.set('Invitación enviada.');
        },
        error: (err: HttpErrorResponse) => {
          this.submittingInv.set(false);
          this.error.set(this.mapError(err));
        },
      });
  }

  protected onCancelar(): void {
    const inv = this.invitacionPendiente();
    if (!inv) return;
    this.invitacionService.cancelar(inv.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.invitaciones.update((prev) => prev.map((i) => i.id === updated.id ? updated : i));
          this.actionMessage.set('Invitación cancelada.');
        },
        error: (err: HttpErrorResponse) => this.error.set(this.mapError(err)),
      });
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Sin conexión.';
    if (err.status === 404) return 'Trabajo no encontrado.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return 'No se pudo completar la acción.';
  }
}

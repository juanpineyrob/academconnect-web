import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import {
  ESTADO_LABEL,
  TIPO_LABEL,
  TrabajoListItem,
} from '@features/repositorio/repositorio.models';
import { isProblemDetail } from '@core/http/problem-detail';
import { InvitarOrientadorForm } from '../components/invitar-orientador-form/invitar-orientador-form';
import { SolicitarCoorientadorForm } from '../components/solicitar-coorientador-form/solicitar-coorientador-form';
import { VersionesCard } from '../components/versiones-card/versiones-card';
import { InvitacionOrientacionService } from '../invitacion-orientacion.service';
import { InvitacionOrientacion } from '../invitacion-orientacion.models';
import { MisTrabajosService } from '../mis-trabajos.service';
import { SolicitudCoorientacionService } from '../solicitud-coorientacion.service';
import { SolicitudCoorientacion } from '../solicitud-coorientacion.models';

@Component({
  selector: 'ac-mis-trabajos-detalle-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Card, InvitarOrientadorForm, SolicitarCoorientadorForm, VersionesCard],
  templateUrl: './mis-trabajos-detalle-page.html',
  styleUrl: './mis-trabajos-detalle-page.scss',
})
export class MisTrabajosDetallePage {
  private readonly route = inject(ActivatedRoute);
  private readonly trabajosService = inject(MisTrabajosService);
  private readonly invitacionService = inject(InvitacionOrientacionService);
  private readonly coorientacionService = inject(SolicitudCoorientacionService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly trabajo = signal<TrabajoListItem | null>(null);
  protected readonly invitaciones = signal<InvitacionOrientacion[]>([]);
  protected readonly solicitudesCoorientacion = signal<SolicitudCoorientacion[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly submittingInv = signal<boolean>(false);
  protected readonly submittingCoorientacion = signal<boolean>(false);
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

  protected readonly esDueno = computed(() => {
    const t = this.trabajo();
    const u = this.auth.currentUser();
    return !!t && !!u && t.estudianteId === u.userId;
  });

  protected readonly coorientacionPendiente = computed(() =>
    this.solicitudesCoorientacion().find((s) => s.estado === 'PENDIENTE') ?? null);
  protected readonly coorientadorAsignado = computed(() =>
    this.solicitudesCoorientacion().find((s) => s.estado === 'ACEPTADA') ?? null);
  protected readonly puedeSolicitarCoorientador = computed(() => {
    const t = this.trabajo();
    return !!t && t.orientadorId != null
      && t.estado !== 'APROBADO' && t.estado !== 'RECHAZADO' && t.estado !== 'CANCELADO'
      && this.coorientacionPendiente() == null && this.coorientadorAsignado() == null;
  });

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    forkJoin({
      trabajo: this.trabajosService.getById(id).pipe(
        catchError((err: HttpErrorResponse) => { this.error.set(this.mapError(err)); return of(null); })),
      invitaciones: this.invitacionService.listarPorTrabajo(id).pipe(
        catchError(() => of<InvitacionOrientacion[]>([]))),
      coorientaciones: this.coorientacionService.listarPorTrabajo(id).pipe(
        catchError(() => of<SolicitudCoorientacion[]>([]))),
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ trabajo, invitaciones, coorientaciones }) => {
        this.trabajo.set(trabajo);
        this.invitaciones.set(invitaciones);
        this.solicitudesCoorientacion.set(coorientaciones);
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

  protected onSolicitarCoorientador(payload: { usuarioId: number; motivo: string | null }): void {
    const t = this.trabajo();
    if (!t) return;
    this.submittingCoorientacion.set(true);
    this.coorientacionService.crear({ trabajoId: t.id, usuarioId: payload.usuarioId, motivo: payload.motivo })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => { this.submittingCoorientacion.set(false); this.solicitudesCoorientacion.update((prev) => [s, ...prev]); },
        error: () => { this.submittingCoorientacion.set(false); },
      });
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Sin conexión.';
    if (err.status === 404) return 'Trabajo no encontrado.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return 'No se pudo completar la acción.';
  }
}

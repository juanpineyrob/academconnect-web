import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { AuthService } from '@core/auth/auth.service';
import { isProblemDetail } from '@core/http/problem-detail';
import { ESTADO_LABEL, TIPO_LABEL, TrabajoListItem } from '@features/repositorio/repositorio.models';
import { RepositorioService } from '@features/repositorio/repositorio.service';
import { SolicitudVinculacionService } from '@features/mis-publicaciones/solicitud-vinculacion.service';
import { SolicitudVinculacion } from '@features/mis-publicaciones/solicitud-vinculacion.models';

@Component({
  selector: 'ac-hub-detalle-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, Button, Card, DatePipe],
  templateUrl: './hub-detalle-page.html',
  styleUrl: './hub-detalle-page.scss',
})
export class HubDetallePage {
  private readonly route = inject(ActivatedRoute);
  private readonly repo = inject(RepositorioService);
  private readonly solicitudService = inject(SolicitudVinculacionService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly trabajo = signal<TrabajoListItem | null>(null);
  protected readonly misSolicitudes = signal<SolicitudVinculacion[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly submitting = signal<boolean>(false);
  protected readonly message = signal<string | null>(null);

  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly estadoLabel = ESTADO_LABEL;

  protected readonly motivoControl = this.fb.nonNullable.control('');

  protected readonly miSolicitud = computed<SolicitudVinculacion | null>(() => {
    const t = this.trabajo();
    if (!t) return null;
    return this.misSolicitudes().find((s) => s.trabajoId === t.id) ?? null;
  });

  protected readonly puedePostularse = computed(() => {
    const t = this.trabajo();
    return !!t && t.estado === 'ABIERTO' && this.miSolicitud() == null;
  });

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    forkJoin({
      trabajo: this.repo.getById(id).pipe(
        catchError((err: HttpErrorResponse) => { this.error.set(this.mapError(err)); return of(null); })),
      mis: this.solicitudService.listarMis().pipe(catchError(() => of<SolicitudVinculacion[]>([]))),
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ trabajo, mis }) => {
        this.trabajo.set(trabajo);
        this.misSolicitudes.set(mis);
        this.loading.set(false);
      });
  }

  protected postularse(): void {
    const t = this.trabajo();
    const me = this.auth.currentUser();
    if (!t || !me) return;
    const motivo = this.motivoControl.value.trim() || null;
    this.submitting.set(true);
    this.solicitudService.enviar({ trabajoId: t.id, estudianteId: me.userId, motivo })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.misSolicitudes.update((prev) => [s, ...prev]);
          this.submitting.set(false);
          this.message.set('Solicitud enviada.');
          this.motivoControl.setValue('');
        },
        error: (err: HttpErrorResponse) => { this.submitting.set(false); this.error.set(this.mapError(err)); },
      });
  }

  protected cancelar(): void {
    const s = this.miSolicitud();
    if (!s) return;
    this.solicitudService.cancelar(s.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.misSolicitudes.update((prev) => prev.map((x) => x.id === updated.id ? updated : x));
          this.message.set('Solicitud cancelada.');
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

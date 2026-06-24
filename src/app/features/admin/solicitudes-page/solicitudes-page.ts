import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { AdminService } from '../admin.service';
import { EstadoSolicitud, SolicitudCuenta } from '../admin.models';

const PAGE_SIZE = 10;

@Component({
  selector: 'ac-solicitudes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, Button],
  templateUrl: './solicitudes-page.html',
  styleUrl: './solicitudes-page.scss',
})
export class SolicitudesPage {
  private readonly service = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly ESTADOS: readonly { value: EstadoSolicitud; label: string }[] = [
    { value: 'PENDIENTE', label: 'Pendiente' },
    { value: 'APROBADA', label: 'Aprobada' },
    { value: 'RECHAZADA', label: 'Rechazada' },
  ];

  protected readonly solicitudes = signal<SolicitudCuenta[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionId = signal<number | null>(null);
  protected readonly rechazoId = signal<number | null>(null);

  protected readonly page = signal<number>(0);
  protected readonly totalPages = signal<number>(0);
  protected readonly totalElements = signal<number>(0);
  protected readonly first = signal<boolean>(true);
  protected readonly last = signal<boolean>(true);

  protected readonly buscador = new FormControl('', { nonNullable: true });
  protected readonly filtroEstado = new FormControl<EstadoSolicitud | ''>('PENDIENTE', {
    nonNullable: true,
  });
  protected readonly motivo = new FormControl('', { nonNullable: true });

  constructor() {
    this.buscador.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(0);
        this.cargar();
      });
    this.filtroEstado.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.page.set(0);
      this.cargar();
    });
    this.cargar();
  }

  private cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    this.rechazoId.set(null);
    this.service
      .buscarSolicitudes({
        estado: this.filtroEstado.value,
        q: this.buscador.value,
        page: this.page(),
        size: PAGE_SIZE,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          if (p.content.length === 0 && p.number > 0) {
            this.page.set(p.number - 1);
            this.cargar();
            return;
          }
          this.solicitudes.set(p.content);
          this.totalPages.set(p.totalPages);
          this.totalElements.set(p.totalElements);
          this.first.set(p.first);
          this.last.set(p.last);
          this.page.set(p.number);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No se pudieron cargar las solicitudes.');
          this.loading.set(false);
        },
      });
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

  protected estadoLabel(estado: EstadoSolicitud): string {
    return this.ESTADOS.find((e) => e.value === estado)?.label ?? estado;
  }

  protected aprobar(s: SolicitudCuenta): void {
    this.actionId.set(s.id);
    this.error.set(null);
    this.service
      .aprobarSolicitud(s.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionId.set(null);
          this.cargar();
        },
        error: (err: HttpErrorResponse) => {
          this.actionId.set(null);
          if (err.status === 409) {
            this.error.set(
              'Esa matrícula o correo ya tiene una cuenta. No se puede aprobar la solicitud.',
            );
          } else {
            this.error.set('No se pudo aprobar la solicitud.');
          }
        },
      });
  }

  protected pedirRechazo(s: SolicitudCuenta): void {
    this.rechazoId.set(s.id);
    this.motivo.reset('');
  }

  protected cancelarRechazo(): void {
    this.rechazoId.set(null);
  }

  protected confirmarRechazo(s: SolicitudCuenta): void {
    this.actionId.set(s.id);
    this.error.set(null);
    this.service
      .rechazarSolicitud(s.id, this.motivo.value.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.rechazoId.set(null);
          this.actionId.set(null);
          this.cargar();
        },
        error: () => {
          this.actionId.set(null);
          this.error.set('No se pudo rechazar la solicitud.');
        },
      });
  }
}

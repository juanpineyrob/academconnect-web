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
import { Observable, of, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthService } from '@core/auth/auth.service';
import { Perfil, UsuarioAreasRequest } from '../perfil.models';
import { PerfilService } from '../perfil.service';
import { ProblemDetail, isProblemDetail } from '@core/http/problem-detail';

import { BioAcademica } from '../components/bio-academica/bio-academica';
import { EditarAreasForm } from '../components/editar-areas-form/editar-areas-form';
import {
  EditarPerfilForm,
  EditarPerfilSavePayload,
} from '../components/editar-perfil-form/editar-perfil-form';
import { LineasInvestigacion } from '../components/lineas-investigacion/lineas-investigacion';
import { PerfilHeader } from '../components/perfil-header/perfil-header';
import { PerfilStats } from '../components/perfil-stats/perfil-stats';
import { PublicacionesRecientes } from '../components/publicaciones-recientes/publicaciones-recientes';

@Component({
  selector: 'ac-perfil-propio-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BioAcademica,
    EditarAreasForm,
    EditarPerfilForm,
    LineasInvestigacion,
    PerfilHeader,
    PerfilStats,
    PublicacionesRecientes,
  ],
  templateUrl: './perfil-propio-page.html',
  styleUrl: './perfil-propio-page.scss',
})
export class PerfilPropioPage {
  private readonly perfilService = inject(PerfilService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly perfil = signal<Perfil | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly evaluadorStats = signal<import('../perfil.models').StatsEvaluador | null>(
    null,
  );
  protected readonly trabajos = signal<import('../perfil.models').TrabajoResumen[] | null>(null);

  protected readonly isEstudiante = computed(() => this.perfil()?.rol === 'ESTUDIANTE');
  protected readonly isEvaluador = computed(() => {
    const r = this.perfil()?.rol;
    return r === 'PROFESOR' || r === 'EXTERNO';
  });

  protected readonly editPerfilOpen = signal(false);
  protected readonly editAreasOpen = signal(false);
  protected readonly savingPerfil = signal(false);
  protected readonly savingAreas = signal(false);
  protected readonly perfilFormError = signal<string | null>(null);
  protected readonly areasFormError = signal<string | null>(null);

  constructor() {
    this.loadPerfil();
  }

  private loadPerfil(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.perfilService
      .getMiPerfil()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (perfil) => {
          this.perfil.set(perfil);
          this.loading.set(false);
          this.loadRelated(perfil);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadError.set(this.mapError(err, 'No se pudo cargar el perfil.'));
        },
      });
  }

  private loadRelated(perfil: Perfil): void {
    if (perfil.rol === 'PROFESOR' || perfil.rol === 'EXTERNO') {
      this.perfilService
        .getStatsEvaluador()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((s) => this.evaluadorStats.set(s));
    }

    if (perfil.rol === 'ESTUDIANTE') {
      this.perfilService
        .getTrabajosAprobados(perfil.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((ts) => this.trabajos.set(ts));
    }
  }

  protected openEditPerfil(): void {
    this.perfilFormError.set(null);
    this.editPerfilOpen.set(true);
  }

  protected closeEditPerfil(): void {
    this.editPerfilOpen.set(false);
  }

  protected onSavePerfil(evt: EditarPerfilSavePayload): void {
    this.savingPerfil.set(true);
    this.perfilFormError.set(null);

    const currentFotoUrl = this.perfil()?.fotoUrl ?? null;
    const fotoUrl$: Observable<string | null> = evt.photoBlob
      ? this.perfilService.uploadFotoPerfil(evt.photoBlob).pipe(map((r) => r.fotoUrl))
      : of(evt.removePhoto ? null : currentFotoUrl);

    fotoUrl$
      .pipe(
        switchMap((fotoUrl) =>
          this.perfilService.putMiPerfil({ ...evt.payload, fotoUrl }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.perfil.set(updated);
          this.auth.patchCurrentUser({ nombre: updated.nombre, fotoUrl: updated.fotoUrl });
          this.savingPerfil.set(false);
          this.editPerfilOpen.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.savingPerfil.set(false);
          this.perfilFormError.set(this.mapError(err, 'No se pudieron guardar los cambios.'));
        },
      });
  }

  protected openEditAreas(): void {
    this.areasFormError.set(null);
    this.editAreasOpen.set(true);
  }

  protected closeEditAreas(): void {
    this.editAreasOpen.set(false);
  }

  protected onSaveAreas(payload: UsuarioAreasRequest): void {
    this.savingAreas.set(true);
    this.areasFormError.set(null);
    this.perfilService
      .putMisAreas(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (areas) => {
          const current = this.perfil();
          if (current) this.perfil.set({ ...current, areas });
          this.savingAreas.set(false);
          this.editAreasOpen.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.savingAreas.set(false);
          this.areasFormError.set(this.mapError(err, 'No se pudieron guardar las áreas.'));
        },
      });
  }

  private mapError(err: HttpErrorResponse, fallback: string): string {
    const pd = isProblemDetail(err.error) ? (err.error as ProblemDetail) : null;
    if (pd?.type === 'urn:academconnect:error:validation') {
      const first = pd.errors ? Object.values(pd.errors).flat()[0] : null;
      return first ?? 'Revisá los datos ingresados.';
    }
    if (pd?.detail) return pd.detail;
    if (err.status === 0) return 'No se pudo conectar con el servidor.';
    return fallback;
  }
}

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
import { ActivatedRoute } from '@angular/router';

import { BioAcademica } from '../components/bio-academica/bio-academica';
import { LineasInvestigacion } from '../components/lineas-investigacion/lineas-investigacion';
import { PerfilHeader } from '../components/perfil-header/perfil-header';
import { PerfilStats } from '../components/perfil-stats/perfil-stats';
import { PublicacionesRecientes } from '../components/publicaciones-recientes/publicaciones-recientes';
import { Reconocimientos } from '../components/reconocimientos/reconocimientos';
import { PerfilPublico, Reconocimiento, TrabajoResumen } from '../perfil.models';
import { PerfilService } from '../perfil.service';

@Component({
  selector: 'ac-perfil-publico-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BioAcademica,
    LineasInvestigacion,
    PerfilHeader,
    PerfilStats,
    PublicacionesRecientes,
    Reconocimientos,
  ],
  templateUrl: './perfil-publico-page.html',
  styleUrl: './perfil-publico-page.scss',
})
export class PerfilPublicoPage {
  private readonly perfilService = inject(PerfilService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly perfil = signal<PerfilPublico | null>(null);
  protected readonly trabajos = signal<TrabajoResumen[] | null>(null);
  protected readonly reconocimientos = signal<Reconocimiento[]>([]);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  protected readonly isEstudiante = computed(() => this.perfil()?.rol === 'ESTUDIANTE');

  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => {
        const raw = p.get('id');
        const id = raw === null ? NaN : Number(raw);
        if (Number.isFinite(id) && id > 0) {
          this.load(id);
        } else {
          this.loading.set(false);
          this.notFound.set(true);
        }
      });
  }

  private load(id: number): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.perfilService
      .getPerfilPublico(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (perfil) => {
          this.perfil.set(perfil);
          this.loading.set(false);

          this.perfilService
            .listarReconocimientos(id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((rs) => this.reconocimientos.set(rs));

          if (perfil.rol === 'ESTUDIANTE') {
            this.perfilService
              .getTrabajosAprobados(id)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe((ts) => this.trabajos.set(ts));
          }
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          if (err.status === 404) {
            this.notFound.set(true);
          }
        },
      });
  }
}

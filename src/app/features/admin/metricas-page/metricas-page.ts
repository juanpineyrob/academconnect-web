import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Button } from '@shared/ui/button/button';
import { StatCard } from '@shared/ui/stat-card/stat-card';
import { ESTADO_LABEL } from '@features/repositorio/repositorio.models';
import { EstadoTrabajo } from '@features/perfil/perfil.models';
import { AdminService } from '../admin.service';
import { CargaEvaluador, Metricas, TrabajosPorEstado } from '../admin.models';

type Tono = 'aprobado' | 'rechazado' | 'revision' | 'enviado' | 'borrador';

const ORDEN_ESTADOS: EstadoTrabajo[] = [
  'BORRADOR', 'ABIERTO', 'EN_DESARROLLO', 'EN_EVALUACION', 'APROBADO', 'RECHAZADO', 'CANCELADO',
];

const ESTADO_TONO: Record<EstadoTrabajo, Tono> = {
  BORRADOR: 'borrador',
  ABIERTO: 'enviado',
  EN_DESARROLLO: 'revision',
  EN_EVALUACION: 'revision',
  APROBADO: 'aprobado',
  RECHAZADO: 'rechazado',
  CANCELADO: 'borrador',
};

interface BarraEstado {
  estado: EstadoTrabajo;
  label: string;
  cantidad: number;
  tono: Tono;
  pct: number;
}

interface BarraEvaluador {
  evaluadorId: number;
  nombre: string;
  cargaActiva: number;
  pct: number;
}

@Component({
  selector: 'ac-metricas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, StatCard, Button],
  templateUrl: './metricas-page.html',
  styleUrl: './metricas-page.scss',
})
export class MetricasPage {
  private readonly service = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly metricas = signal<Metricas | null>(null);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly exporting = signal<boolean>(false);

  protected readonly tiempoPromedioLabel = computed(() => {
    const h = this.metricas()?.tiempoPromedioEvaluacionHoras;
    if (h == null) return '—';
    return h < 24 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} días`;
  });

  protected readonly evaluadoresConCarga = computed(
    () => this.metricas()?.cargaPorEvaluador.filter((c) => c.cargaActiva > 0).length ?? 0,
  );

  protected readonly giniLabel = computed(() => {
    const g = this.metricas()?.giniCarga;
    return g == null ? '—' : g.toFixed(2);
  });

  protected readonly barrasEstado = computed<BarraEstado[]>(() => {
    const m = this.metricas();
    if (!m) return [];
    const porEstado = new Map<string, number>(
      m.trabajosPorEstado.map((e: TrabajosPorEstado) => [e.estado, e.cantidad]),
    );
    const max = Math.max(1, ...ORDEN_ESTADOS.map((e) => porEstado.get(e) ?? 0));
    return ORDEN_ESTADOS.map((estado) => {
      const cantidad = porEstado.get(estado) ?? 0;
      return {
        estado,
        label: ESTADO_LABEL[estado],
        cantidad,
        tono: ESTADO_TONO[estado],
        pct: Math.round((cantidad / max) * 100),
      };
    });
  });

  protected readonly barrasEvaluador = computed<BarraEvaluador[]>(() => {
    const m = this.metricas();
    if (!m) return [];
    const ordenados = [...m.cargaPorEvaluador].sort((a, b) => b.cargaActiva - a.cargaActiva);
    const max = Math.max(1, ...ordenados.map((c: CargaEvaluador) => c.cargaActiva));
    return ordenados.map((c) => ({
      evaluadorId: c.evaluadorId,
      nombre: c.nombre,
      cargaActiva: c.cargaActiva,
      pct: Math.round((c.cargaActiva / max) * 100),
    }));
  });

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .obtenerMetricas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (m) => {
          this.metricas.set(m);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.error.set(err.status === 0 ? 'Sin conexión.' : 'No se pudieron cargar las métricas.');
          this.loading.set(false);
        },
      });
  }

  protected exportarCsv(): void {
    this.exporting.set(true);
    this.service
      .exportarMetricasCsv()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'metricas-academconnect.csv';
          a.click();
          URL.revokeObjectURL(url);
          this.exporting.set(false);
        },
        error: () => this.exporting.set(false),
      });
  }
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { StatCard } from '@shared/ui/stat-card/stat-card';
import { Perfil, StatsEvaluador } from '../../perfil.models';

interface Stat {
  label: string;
  value: string | number;
  sublabel?: string | null;
}

@Component({
  selector: 'ac-perfil-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatCard],
  template: `
    <div class="perfil-stats">
      @for (stat of stats(); track stat.label) {
        <ac-stat-card [label]="stat.label" [value]="stat.value" [sublabel]="stat.sublabel ?? null" />
      }
    </div>
  `,
  styleUrl: './perfil-stats.scss',
})
export class PerfilStats {
  readonly perfil = input.required<Perfil>();
  readonly evaluadorStats = input<StatsEvaluador | null>(null);

  protected readonly stats = computed<Stat[]>(() => {
    const p = this.perfil();
    if (p.rol === 'ESTUDIANTE') {
      return [
        {
          label: 'Trabajos publicados',
          value: p.trabajosPublicados,
          sublabel: 'Aportes acreditados',
        },
        {
          label: 'Áreas de interés',
          value: p.areas.length,
          sublabel: 'Disciplinas declaradas',
        },
        {
          label: 'Trabajos en curso',
          value: '—',
          sublabel: 'Sincroniza con el repositorio',
        },
        {
          label: 'Cuenta desde',
          value: new Date(p.createdAt).getFullYear(),
          sublabel: 'Antigüedad en la plataforma',
        },
      ];
    }
    const ev = this.evaluadorStats();
    return [
      {
        label: 'Evaluaciones completadas',
        value: ev?.evaluacionesCompletadas ?? '—',
        sublabel: 'Histórico personal',
      },
      {
        label: 'Tiempo medio',
        value: ev ? `${round1(ev.tiempoMedioRespuestaDias)} d` : '—',
        sublabel: 'Respuesta promedio',
      },
      {
        label: 'Score medio dado',
        value: ev ? round1(ev.scoreMedioDado) : '—',
        sublabel: 'Sobre escala 0–10',
      },
      {
        label: 'Veredictos',
        value: ev ? `${ev.aprobadosAportados} / ${ev.rechazadosAportados}` : '—',
        sublabel: 'Aprobados / Rechazados',
      },
    ];
  });
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

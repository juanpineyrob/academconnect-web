import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { StatCard } from '@shared/ui/stat-card/stat-card';
import { Perfil, PerfilPublico, StatsEvaluador } from '../../perfil.models';

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
  readonly perfil = input.required<Perfil | PerfilPublico>();
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
          label: 'Líneas activas',
          value: p.areas.length,
          sublabel: 'Áreas derivadas de sus trabajos',
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
        label: 'Trabajos orientados',
        value: p.trabajosPublicados,
        sublabel: 'Tutorías aprobadas',
      },
    ];
  });
}

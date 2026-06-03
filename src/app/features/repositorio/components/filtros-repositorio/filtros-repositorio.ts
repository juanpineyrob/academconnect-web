import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Button } from '@shared/ui/button/button';
import { AreaTematica, TipoTrabajo } from '@features/perfil/perfil.models';
import { TIPO_LABEL } from '../../repositorio.models';

export interface FiltrosState {
  areaIds: number[];
  tipo: TipoTrabajo | null;
  anios: number[];
}

const TIPOS: TipoTrabajo[] = ['TCC', 'TESIS', 'PAPER', 'MONOGRAFIA', 'PROYECTO_INVESTIGACION'];

@Component({
  selector: 'ac-filtros-repositorio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  templateUrl: './filtros-repositorio.html',
  styleUrl: './filtros-repositorio.scss',
})
export class FiltrosRepositorio {
  readonly areas = input.required<AreaTematica[]>();
  readonly areasLoading = input<boolean>(false);
  readonly value = input.required<FiltrosState>();

  readonly valueChange = output<FiltrosState>();
  readonly clearAll = output<void>();

  protected readonly tipos = TIPOS;
  protected readonly tipoLabel = TIPO_LABEL;

  protected readonly anios = computed(() => {
    const now = new Date().getFullYear();
    return [now, now - 1, now - 2, now - 3, now - 4];
  });

  protected readonly hasFilters = computed(() => {
    const v = this.value();
    return v.areaIds.length > 0 || v.tipo !== null || v.anios.length > 0;
  });

  protected isAreaSelected(id: number): boolean {
    return this.value().areaIds.includes(id);
  }

  protected isAnioSelected(anio: number): boolean {
    return this.value().anios.includes(anio);
  }

  protected toggleArea(id: number): void {
    const cur = this.value();
    const next = cur.areaIds.includes(id)
      ? cur.areaIds.filter((a) => a !== id)
      : [...cur.areaIds, id];
    this.valueChange.emit({ ...cur, areaIds: next });
  }

  protected toggleAnio(anio: number): void {
    const cur = this.value();
    const next = cur.anios.includes(anio)
      ? cur.anios.filter((a) => a !== anio)
      : [...cur.anios, anio];
    this.valueChange.emit({ ...cur, anios: next });
  }

  protected setTipo(tipo: TipoTrabajo | null): void {
    this.valueChange.emit({ ...this.value(), tipo });
  }

  protected onClear(): void {
    this.clearAll.emit();
  }
}

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Avatar } from '@shared/ui/avatar/avatar';
import { Badge } from '@shared/ui/badge/badge';
import { Button } from '@shared/ui/button/button';
import { Perfil, PerfilPublico } from '../../perfil.models';

const ROL_LABEL: Record<string, string> = {
  ESTUDIANTE: 'Estudiante',
  PROFESOR: 'Profesor evaluador',
  EXTERNO: 'Evaluador externo',
  ADMINISTRADOR: 'Administrador',
};

@Component({
  selector: 'ac-perfil-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, Badge, Button],
  templateUrl: './perfil-header.html',
  styleUrl: './perfil-header.scss',
})
export class PerfilHeader {
  readonly perfil = input.required<Perfil | PerfilPublico>();
  readonly isOwn = input<boolean>(false);
  readonly editClick = output<void>();

  protected readonly rolLabel = computed(() => ROL_LABEL[this.perfil().rol] ?? this.perfil().rol);

  protected readonly avatarVersion = computed(() => {
    const p = this.perfil() as Partial<Perfil>;
    return p.updatedAt ?? p.createdAt ?? '';
  });

  protected readonly esActivo = computed(() => {
    const p = this.perfil() as Partial<Perfil>;
    return p.activo ?? true;
  });

  protected readonly afiliacion = computed(() => {
    const p = this.perfil();
    if (p.rol === 'ESTUDIANTE') {
      return p.titulacion ?? 'Titulación no informada';
    }
    return [p.cargo, p.institucion].filter(Boolean).join(' · ') || 'Afiliación no informada';
  });

  protected onEdit(): void {
    this.editClick.emit();
  }
}

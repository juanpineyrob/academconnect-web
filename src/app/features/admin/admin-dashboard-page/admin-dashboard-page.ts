import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Card } from '@shared/ui/card/card';

interface AdminAccion {
  titulo: string;
  descripcion: string;
  route?: string;
  disponible: boolean;
}

@Component({
  selector: 'ac-admin-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Card],
  templateUrl: './admin-dashboard-page.html',
  styleUrl: './admin-dashboard-page.scss',
})
export class AdminDashboardPage {
  protected readonly acciones: AdminAccion[] = [
    {
      titulo: 'Importar trabajos',
      descripcion: 'Dar de alta trabajos finalizados fuera del sistema en su estado final.',
      route: '/admin/importar-trabajo',
      disponible: true,
    },
    {
      titulo: 'Moderar trabajos',
      descripcion: 'Ocultar del repositorio público o eliminar definitivamente trabajos aprobados.',
      route: '/admin/moderar-trabajos',
      disponible: true,
    },
    {
      titulo: 'Usuarios',
      descripcion: 'Alta, baja y modificación de cuentas de estudiantes, profesores, externos y administradores.',
      route: '/admin/usuarios',
      disponible: true,
    },
    {
      titulo: 'Áreas temáticas',
      descripcion: 'Gestión de las áreas CNPq y subáreas disponibles para clasificar trabajos y perfiles.',
      route: '/admin/areas-tematicas',
      disponible: true,
    },
    {
      titulo: 'Auditoría',
      descripcion: 'Bitácora de actividad del sistema y eventos críticos.',
      route: '/admin/auditoria',
      disponible: true,
    },
  ];
}

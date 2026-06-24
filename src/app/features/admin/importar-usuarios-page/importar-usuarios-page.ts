import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Button } from '@shared/ui/button/button';
import { isProblemDetail } from '@core/http/problem-detail';
import { AdminService } from '../admin.service';
import { ImportPreview, ResultadoFila } from '../admin.models';

const MAX_BYTES = 5 * 1024 * 1024;
const MIME_OK = new Set(['text/csv', 'application/vnd.ms-excel', '']);

const RESULTADO_LABEL: Record<ResultadoFila, string> = {
  NUEVO: 'Nuevo',
  EXISTE_ACTIVA: 'Ya activa',
  EXISTE_INVITADA: 'Invitada',
  COLISION_EMAIL: 'Colisión de email',
  COLISION_MATRICULA: 'Colisión de matrícula',
  ERROR_FORMATO: 'Error de formato',
};

@Component({
  selector: 'ac-importar-usuarios-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, Button],
  templateUrl: './importar-usuarios-page.html',
  styleUrl: './importar-usuarios-page.scss',
})
export class ImportarUsuariosPage {
  private readonly service = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly resultadoLabel = RESULTADO_LABEL;

  protected readonly archivo = signal<File | null>(null);
  protected readonly preview = signal<ImportPreview | null>(null);
  protected readonly subiendo = signal<boolean>(false);
  protected readonly confirmando = signal<boolean>(false);
  protected readonly confirmado = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected readonly reenviarInvitadas = new FormControl<boolean>(false, { nonNullable: true });

  protected readonly nombreArchivo = computed(() => this.archivo()?.name ?? null);

  protected onArchivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (file && (!file.name.toLowerCase().endsWith('.csv') || !MIME_OK.has(file.type))) {
      this.error.set('El archivo debe ser un CSV.');
      return;
    }
    if (file && file.size > MAX_BYTES) {
      this.error.set('El archivo supera el tamaño máximo (5 MB).');
      return;
    }

    this.archivo.set(file);
    this.preview.set(null);
    this.confirmado.set(false);
    this.error.set(null);
  }

  protected previsualizar(): void {
    const file = this.archivo();
    if (!file || this.subiendo()) return;
    this.subiendo.set(true);
    this.error.set(null);
    this.confirmado.set(false);
    this.service
      .previewImportacion(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.preview.set(p);
          this.subiendo.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.subiendo.set(false);
          this.error.set(this.mapError(err, 'No se pudo procesar el archivo.'));
        },
      });
  }

  protected confirmar(): void {
    const p = this.preview();
    if (!p || this.confirmando()) return;
    this.confirmando.set(true);
    this.error.set(null);
    this.service
      .confirmarImportacion(p.loteId, this.reenviarInvitadas.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.preview.set(res);
          this.confirmando.set(false);
          this.confirmado.set(true);
        },
        error: (err: HttpErrorResponse) => {
          this.confirmando.set(false);
          this.error.set(this.mapError(err, 'No se pudo confirmar la importación.'));
        },
      });
  }

  protected reiniciar(): void {
    this.archivo.set(null);
    this.preview.set(null);
    this.confirmado.set(false);
    this.error.set(null);
    this.reenviarInvitadas.setValue(false);
  }

  private mapError(err: HttpErrorResponse, fallback: string): string {
    if (err.status === 0) return 'No pudimos conectarnos con el servidor.';
    if (err.status === 403) return 'No tenés permisos para importar usuarios.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return fallback;
  }
}

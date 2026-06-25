import {
  ChangeDetectionStrategy, Component, DestroyRef, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { TiposTrabajoConfigService } from '../tipos-trabajo-config.service';
import { ModoEvaluacion, TipoTrabajo } from '../tipos-trabajo-config.models';

const TIPOS: TipoTrabajo[] = ['TCC', 'TESIS', 'PAPER', 'MONOGRAFIA', 'PROYECTO_INVESTIGACION'];
const MODOS: ModoEvaluacion[] = ['SINCRONO', 'ASINCRONO', 'HIBRIDO'];

@Component({
  selector: 'ac-tipos-trabajo-config-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, Card],
  templateUrl: './tipos-trabajo-config-page.html',
  styleUrl: './tipos-trabajo-config-page.scss',
})
export class TiposTrabajoConfigPage {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(TiposTrabajoConfigService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tipos = TIPOS;
  protected readonly modos = MODOS;
  protected readonly tipoSel = signal<TipoTrabajo | null>(null);
  protected readonly loading = signal<boolean>(false);
  protected readonly saving = signal<boolean>(false);
  protected readonly guardado = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    modoEvaluacion: ['SINCRONO' as ModoEvaluacion, Validators.required],
    evaluadoresDefault: [3, [Validators.required, Validators.min(1)]],
    secuencial: [true],
    instancias: this.fb.array<FormGroup>([]),
  });

  protected get instancias(): FormArray<FormGroup> {
    return this.form.controls.instancias;
  }

  protected nuevaInstancia(nombre = '', evaluadores = 2, maxIntentos = 1): FormGroup {
    return this.fb.nonNullable.group({
      nombre: [nombre, [Validators.required, Validators.maxLength(200)]],
      evaluadoresRequeridos: [evaluadores, [Validators.required, Validators.min(1)]],
      maxIntentos: [maxIntentos, [Validators.required, Validators.min(1)]],
    });
  }

  protected seleccionar(tipo: TipoTrabajo): void {
    this.tipoSel.set(tipo);
    this.guardado.set(false);
    this.error.set(null);
    this.loading.set(true);
    this.service.buscarPorTipo(tipo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cfg) => {
          this.form.controls.modoEvaluacion.setValue(cfg.modoEvaluacion);
          this.form.controls.evaluadoresDefault.setValue(cfg.evaluadoresDefault);
          this.form.controls.secuencial.setValue(cfg.secuencial);
          this.instancias.clear();
          for (const i of cfg.instancias) {
            this.instancias.push(this.nuevaInstancia(i.nombre, i.evaluadoresRequeridos, i.maxIntentos));
          }
          this.loading.set(false);
        },
        error: () => {
          // tipo sin config aún: form en defaults, lista vacía
          this.form.controls.modoEvaluacion.setValue('SINCRONO');
          this.form.controls.evaluadoresDefault.setValue(3);
          this.form.controls.secuencial.setValue(true);
          this.instancias.clear();
          this.loading.set(false);
        },
      });
  }

  protected agregarInstancia(): void {
    this.instancias.push(this.nuevaInstancia());
  }

  protected quitarInstancia(i: number): void {
    this.instancias.removeAt(i);
  }

  protected subir(i: number): void {
    if (i <= 0) return;
    const ctrl = this.instancias.at(i);
    this.instancias.removeAt(i);
    this.instancias.insert(i - 1, ctrl);
  }

  protected bajar(i: number): void {
    if (i >= this.instancias.length - 1) return;
    const ctrl = this.instancias.at(i);
    this.instancias.removeAt(i);
    this.instancias.insert(i + 1, ctrl);
  }

  protected guardar(): void {
    const tipo = this.tipoSel();
    if (!tipo || this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.guardado.set(false);
    this.error.set(null);
    this.service.guardar(tipo, {
      modoEvaluacion: this.form.controls.modoEvaluacion.value,
      evaluadoresDefault: this.form.controls.evaluadoresDefault.value,
      secuencial: this.form.controls.secuencial.value,
      instancias: this.instancias.controls.map((c) => ({
        nombre: (c.get('nombre')!.value as string).trim(),
        evaluadoresRequeridos: c.get('evaluadoresRequeridos')!.value as number,
        maxIntentos: c.get('maxIntentos')!.value as number,
      })),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.saving.set(false); this.guardado.set(true); },
        error: () => { this.saving.set(false); this.error.set('No se pudo guardar.'); },
      });
  }
}

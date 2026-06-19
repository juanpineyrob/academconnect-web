import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'ac-confirmar-envio-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  templateUrl: './confirmar-envio-dialog.html',
  styleUrl: './confirmar-envio-dialog.scss',
})
export class ConfirmarEnvioDialog {
  readonly open = input<boolean>(false);
  readonly proyeccion = input<number | null>(null);
  readonly umbral = input<number | null>(null);
  readonly submitting = input<boolean>(false);

  readonly confirmar = output<void>();
  readonly cancelar = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) el.showModal();
      else if (!this.open() && el.open) el.close();
    });
  }
}

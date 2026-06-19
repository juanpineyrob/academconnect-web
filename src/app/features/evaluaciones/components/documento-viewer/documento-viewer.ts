import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { environment } from '@env/environment';

@Component({
  selector: 'ac-documento-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documento-viewer.html',
  styleUrl: './documento-viewer.scss',
})
export class DocumentoViewer {
  readonly trabajoId = input.required<number>();
  readonly versionId = input.required<number>();

  protected readonly url = computed(
    () => `${environment.apiBase}/api/trabajos/${this.trabajoId()}/versiones/${this.versionId()}/documento`,
  );
}

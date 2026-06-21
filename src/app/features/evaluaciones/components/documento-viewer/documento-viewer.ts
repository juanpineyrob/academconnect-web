import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { environment } from '@env/environment';

@Component({
  selector: 'ac-documento-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documento-viewer.html',
  styleUrl: './documento-viewer.scss',
})
export class DocumentoViewer {
  private readonly sanitizer = inject(DomSanitizer);

  readonly trabajoId = input.required<number>();
  readonly versionId = input.required<number>();

  // `inline=true` pide al backend `Content-Disposition: inline` para poder
  // incrustar el PDF en el <object> (sin el flag, el endpoint fuerza descarga).
  protected readonly url = computed(
    () =>
      `${environment.apiBase}/api/trabajos/${this.trabajoId()}/versiones/${this.versionId()}/documento?inline=true`,
  );

  // `<object data>` is a RESOURCE_URL security context; the URL is our own same-origin
  // API endpoint, so it is safe to trust.
  protected readonly safeUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.url()),
  );
}

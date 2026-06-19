import { TestBed } from '@angular/core/testing';
import { DocumentoViewer } from './documento-viewer';

describe('DocumentoViewer', () => {
  it('renderiza el <object> con una URL de recurso segura (no lanza por RESOURCE_URL)', () => {
    const fixture = TestBed.createComponent(DocumentoViewer);
    fixture.componentRef.setInput('trabajoId', 10);
    fixture.componentRef.setInput('versionId', 5);
    fixture.detectChanges();
    const obj = (fixture.nativeElement as HTMLElement).querySelector('object');
    expect(obj?.getAttribute('data')).toContain('/api/trabajos/10/versiones/5/documento');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SolicitudesPage } from './solicitudes-page';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('SolicitudesPage', () => {
  function create() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(SolicitudesPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  }

  function page(content: unknown[]) {
    return {
      content,
      totalElements: content.length,
      totalPages: 1,
      number: 0,
      size: 10,
      first: true,
      last: true,
      numberOfElements: content.length,
      empty: content.length === 0,
    };
  }

  const solicitud = {
    id: 5,
    matricula: 'A1',
    email: 'a@x.test',
    nombre: 'Ana',
    estado: 'PENDIENTE',
    motivoRechazo: null,
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('carga solicitudes pendientes al iniciar', () => {
    const { fixture, http } = create();
    const req = http.expectOne((r) => r.url === `${api}/admin/solicitudes`);
    expect(req.request.params.get('estado')).toBe('PENDIENTE');
    req.flush(page([solicitud]));
    fixture.detectChanges();
    expect(fixture.componentInstance['solicitudes']().length).toBe(1);
    http.verify();
  });

  it('aprobar postea y recarga', () => {
    const { fixture, http } = create();
    http.expectOne((r) => r.url === `${api}/admin/solicitudes`).flush(page([solicitud]));
    fixture.componentInstance['aprobar'](solicitud as never);
    const req = http.expectOne(`${api}/admin/solicitudes/5/aprobar`);
    expect(req.request.method).toBe('POST');
    req.flush({ ...solicitud, estado: 'APROBADA' });
    http.expectOne((r) => r.url === `${api}/admin/solicitudes`).flush(page([]));
    http.verify();
  });

  it('aprobar con 409 muestra error de conflicto de identidad', () => {
    const { fixture, http } = create();
    http.expectOne((r) => r.url === `${api}/admin/solicitudes`).flush(page([solicitud]));
    fixture.componentInstance['aprobar'](solicitud as never);
    http.expectOne(`${api}/admin/solicitudes/5/aprobar`).flush('conflict', {
      status: 409,
      statusText: 'Conflict',
    });
    expect(fixture.componentInstance['error']()).toContain('ya tiene una cuenta');
    http.verify();
  });

  it('confirmarRechazo postea el motivo', () => {
    const { fixture, http } = create();
    http.expectOne((r) => r.url === `${api}/admin/solicitudes`).flush(page([solicitud]));
    const cmp = fixture.componentInstance;
    cmp['pedirRechazo'](solicitud as never);
    cmp['motivo'].setValue('no figura');
    cmp['confirmarRechazo'](solicitud as never);
    const req = http.expectOne(`${api}/admin/solicitudes/5/rechazar`);
    expect(req.request.body).toEqual({ motivo: 'no figura' });
    req.flush({ ...solicitud, estado: 'RECHAZADA' });
    http.expectOne((r) => r.url === `${api}/admin/solicitudes`).flush(page([]));
    http.verify();
  });
});

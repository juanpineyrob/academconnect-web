import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ImportarUsuariosPage } from './importar-usuarios-page';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('ImportarUsuariosPage', () => {
  function create() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(ImportarUsuariosPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  }

  const preview = {
    loteId: 9,
    total: 2,
    nuevos: 1,
    existentes: 1,
    errores: 0,
    items: [
      { linea: 1, matricula: 'A1', email: 'a@x.test', nombre: 'Ana', resultado: 'NUEVO', detalle: null },
      { linea: 2, matricula: 'B2', email: 'b@x.test', nombre: 'Bea', resultado: 'EXISTE_ACTIVA', detalle: null },
    ],
  };

  function fakeFile() {
    return new File(['matricula,email,nombre'], 'usuarios.csv', { type: 'text/csv' });
  }

  it('previsualizar postea multipart y guarda el preview', () => {
    const { fixture, http } = create();
    const cmp = fixture.componentInstance;
    cmp['archivo'].set(fakeFile());
    cmp['previsualizar']();
    const req = http.expectOne(`${api}/admin/importaciones/preview`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush(preview);
    expect(cmp['preview']()?.nuevos).toBe(1);
    http.verify();
  });

  it('confirmar postea reenviarInvitadas y marca confirmado', () => {
    const { fixture, http } = create();
    const cmp = fixture.componentInstance;
    cmp['archivo'].set(fakeFile());
    cmp['previsualizar']();
    http.expectOne(`${api}/admin/importaciones/preview`).flush(preview);
    cmp['reenviarInvitadas'].setValue(true);
    cmp['confirmar']();
    const req = http.expectOne(`${api}/admin/importaciones/9/confirmar`);
    expect(req.request.body).toEqual({ reenviarInvitadas: true });
    req.flush(preview);
    expect(cmp['confirmado']()).toBe(true);
    http.verify();
  });

  it('no previsualiza sin archivo', () => {
    const { fixture, http } = create();
    fixture.componentInstance['previsualizar']();
    http.expectNone(`${api}/admin/importaciones/preview`);
  });

  function changeEvent(file: File): Event {
    const input = { files: [file] } as unknown as HTMLInputElement;
    return { target: input } as unknown as Event;
  }

  it('rechaza un archivo que no es CSV y no previsualiza', () => {
    const { fixture, http } = create();
    const cmp = fixture.componentInstance;
    const noCsv = new File(['x'], 'usuarios.txt', { type: 'text/plain' });
    cmp['onArchivo'](changeEvent(noCsv));
    expect(cmp['error']()).toBe('El archivo debe ser un CSV.');
    expect(cmp['archivo']()).toBeNull();
    cmp['previsualizar']();
    http.expectNone(`${api}/admin/importaciones/preview`);
  });

  it('acepta un archivo CSV válido y permite previsualizar', () => {
    const { fixture, http } = create();
    const cmp = fixture.componentInstance;
    cmp['onArchivo'](changeEvent(fakeFile()));
    expect(cmp['error']()).toBeNull();
    expect(cmp['archivo']()?.name).toBe('usuarios.csv');
    cmp['previsualizar']();
    http.expectOne(`${api}/admin/importaciones/preview`).flush(preview);
    expect(cmp['preview']()?.nuevos).toBe(1);
    http.verify();
  });
});

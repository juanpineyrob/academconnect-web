import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { UsuariosPage } from './usuarios-page';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('UsuariosPage', () => {
  function create() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(UsuariosPage);
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

  const usuario = {
    id: 7,
    email: 'a@x.test',
    matricula: 'A1',
    nombre: 'Ana',
    rol: 'ESTUDIANTE',
    activo: true,
    edad: null,
    ubicacion: null,
    topeAsignaciones: 5,
    titulacion: null,
    cargo: null,
    institucion: null,
    titulo: null,
  };

  it('carga usuarios al iniciar', () => {
    const { fixture, http } = create();
    http.expectOne((r) => r.url === `${api}/admin/usuarios`).flush(page([usuario]));
    fixture.detectChanges();
    expect(fixture.componentInstance['usuarios']().length).toBe(1);
    http.verify();
  });

  it('crear usuario no envía contraseña', () => {
    const { fixture, http } = create();
    http.expectOne((r) => r.url === `${api}/admin/usuarios`).flush(page([]));
    const cmp = fixture.componentInstance;
    cmp['form'].patchValue({
      rol: 'ESTUDIANTE',
      email: 'nuevo@x.test',
      matricula: 'B2',
      nombre: 'Beto',
    });
    cmp['guardar']();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === `${api}/admin/usuarios`);
    expect(req.request.body).not.toHaveProperty('password');
    expect(req.request.body).toMatchObject({ email: 'nuevo@x.test', matricula: 'B2', nombre: 'Beto' });
    req.flush(usuario);
    http.expectOne((r) => r.url === `${api}/admin/usuarios`).flush(page([usuario]));
    http.verify();
  });

  it('enviarEnlace postea al endpoint de enlace y muestra confirmación', () => {
    const { fixture, http } = create();
    http.expectOne((r) => r.url === `${api}/admin/usuarios`).flush(page([usuario]));
    const cmp = fixture.componentInstance;
    cmp['enviarEnlace'](7);
    const req = http.expectOne(`${api}/admin/usuarios/7/enviar-enlace-password`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(cmp['enlaceOk']()).toBe('Enlace de contraseña enviado al correo del usuario.');
    http.verify();
  });

  it('enviarEnlace con error muestra mensaje', () => {
    const { fixture, http } = create();
    http.expectOne((r) => r.url === `${api}/admin/usuarios`).flush(page([usuario]));
    const cmp = fixture.componentInstance;
    cmp['enviarEnlace'](7);
    http.expectOne(`${api}/admin/usuarios/7/enviar-enlace-password`).flush('err', {
      status: 500,
      statusText: 'Server Error',
    });
    expect(cmp['error']()).toContain('No se pudo enviar el enlace');
    http.verify();
  });
});

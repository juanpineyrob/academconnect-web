import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OnboardingService } from './onboarding.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('OnboardingService', () => {
  let service: OnboardingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OnboardingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('solicitar postea matricula/email/nombre', () => {
    service.solicitar({ matricula: 'A1', email: 'a@x.test', nombre: 'Ana' }).subscribe();
    const req = http.expectOne(`${api}/auth/solicitudes`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ matricula: 'A1', email: 'a@x.test', nombre: 'Ana' });
    req.flush({ mensaje: 'ok' });
  });

  it('verificarToken postea el token y parsea la respuesta', () => {
    let res: { valido: boolean; proposito: string | null } | undefined;
    service.verificarToken('tok').subscribe((r) => (res = r));
    const req = http.expectOne(`${api}/auth/token/verificar`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'tok' });
    req.flush({ valido: true, proposito: 'ACTIVACION' });
    expect(res).toEqual({ valido: true, proposito: 'ACTIVACION' });
  });

  it('establecerPassword postea token y password', () => {
    service.establecerPassword({ token: 'tok', password: 'Secreta123' }).subscribe();
    const req = http.expectOne(`${api}/auth/password/establecer`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'tok', password: 'Secreta123' });
    req.flush(null);
  });

  it('recuperarPassword postea el email', () => {
    service.recuperarPassword('a@x.test').subscribe();
    const req = http.expectOne(`${api}/auth/password/recuperar`);
    expect(req.request.body).toEqual({ email: 'a@x.test' });
    req.flush({ mensaje: 'ok' });
  });

  it('reenviarActivacion postea el email', () => {
    service.reenviarActivacion('a@x.test').subscribe();
    const req = http.expectOne(`${api}/auth/activacion/reenviar`);
    expect(req.request.body).toEqual({ email: 'a@x.test' });
    req.flush({ mensaje: 'ok' });
  });
});

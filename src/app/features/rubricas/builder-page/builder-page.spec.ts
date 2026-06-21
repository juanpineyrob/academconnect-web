import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { BuilderPage } from './builder-page';
import { AuthService } from '@core/auth/auth.service';

describe('BuilderPage (rubricas)', () => {
  function create() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: () => ({ userId: 7, rol: 'PROFESOR' }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map() } } },
      ],
    });
    const fixture = TestBed.createComponent(BuilderPage);
    fixture.detectChanges();
    return fixture;
  }

  it('arranca con un criterio y el total de pesos en 100% al distribuir', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp['agregarCriterio']();
    cmp['distribuir']();
    fixture.detectChanges();
    expect(Math.round(cmp['totalPesos']() * 100)).toBe(100);
  });

  it('no permite guardar si la rúbrica es inválida (pesos ≠ 100%)', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp['form'].controls.criterios.at(0).controls.peso.setValue(0.5);
    fixture.detectChanges();
    expect(cmp['errores']().length).toBeGreaterThan(0);
    expect(cmp['puedeGuardar']()).toBe(false);
  });
});

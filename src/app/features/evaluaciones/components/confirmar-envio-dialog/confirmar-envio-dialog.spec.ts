import { TestBed } from '@angular/core/testing';
import { ConfirmarEnvioDialog } from './confirmar-envio-dialog';

describe('ConfirmarEnvioDialog', () => {
  function render() {
    const fixture = TestBed.createComponent(ConfirmarEnvioDialog);
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza el <dialog> sin abrirlo cuando open=false', () => {
    const fixture = render();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog');
    expect(dialog).toBeTruthy();
  });

  it('emite confirmar al click en Enviar', () => {
    const fixture = render();
    let emitted = false;
    fixture.componentInstance.confirmar.subscribe(() => (emitted = true));
    const btn = (fixture.nativeElement as HTMLElement).querySelector('.confirm__primary') as HTMLButtonElement;
    btn.click();
    expect(emitted).toBe(true);
  });
});

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import {
  EmailRequest,
  EstablecerPasswordRequest,
  MensajeResponse,
  SolicitarCuentaRequest,
  VerificarTokenResponse,
} from './onboarding.models';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  /** Self-request de cuenta. El backend responde 202 genérico siempre (anti-enumeración). */
  solicitar(req: SolicitarCuentaRequest): Observable<MensajeResponse> {
    return this.http.post<MensajeResponse>(`${this.api}/auth/solicitudes`, req);
  }

  /** Verifica un token sin consumirlo. */
  verificarToken(token: string): Observable<VerificarTokenResponse> {
    return this.http.post<VerificarTokenResponse>(`${this.api}/auth/token/verificar`, { token });
  }

  /** Consume el token (activación o reset) y fija la contraseña. 204 ok. */
  establecerPassword(req: EstablecerPasswordRequest): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/password/establecer`, req);
  }

  /** Pide un enlace de restablecimiento. 202 genérico siempre. */
  recuperarPassword(email: string): Observable<MensajeResponse> {
    return this.http.post<MensajeResponse>(`${this.api}/auth/password/recuperar`, {
      email,
    } satisfies EmailRequest);
  }

  /** Reenvía el enlace de activación. 202 genérico siempre. */
  reenviarActivacion(email: string): Observable<MensajeResponse> {
    return this.http.post<MensajeResponse>(`${this.api}/auth/activacion/reenviar`, {
      email,
    } satisfies EmailRequest);
  }
}

import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EvaluacionDraftStore {
  private key(asignacionId: number): string {
    return `eval-draft:${asignacionId}`;
  }

  save(asignacionId: number, value: unknown): void {
    localStorage.setItem(this.key(asignacionId), JSON.stringify(value));
  }

  load(asignacionId: number): unknown | null {
    const raw = localStorage.getItem(this.key(asignacionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  clear(asignacionId: number): void {
    localStorage.removeItem(this.key(asignacionId));
  }
}

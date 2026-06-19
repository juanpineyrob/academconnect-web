import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, delay, of } from 'rxjs';

import { environment } from '@env/environment';
import type { Asignacion, Evaluacion } from '../evaluaciones.models';

/**
 * Interceptor de desarrollo: cuando `environment.mockEvaluaciones` está activo,
 * sirve una asignación ACTIVA (id 901) y una COMPLETADA (id 902) para poder probar
 * la cola de evaluación y la pantalla de evaluar sin sembrar el backend.
 *
 * Cubre los endpoints de la feature; cualquier otra request (incluido el documento
 * de la versión, que no se puede mockear como binario) pasa de largo y el visor
 * cae a su fallback. Poner el flag en false para volver a la API real.
 */

const TEMPLATE_SNAPSHOT = JSON.stringify({
  criterios: [
    { codigo: 'metodologia', nombre: 'Metodología', tipo: 'ESCALA', peso: 0.3, escalaMin: 0, escalaMax: 10 },
    { codigo: 'originalidad', nombre: 'Originalidad', tipo: 'SLIDER', peso: 0.3, escalaMin: 0, escalaMax: 10 },
    {
      codigo: 'claridad',
      nombre: 'Claridad de escritura',
      tipo: 'SELECCION',
      peso: 0.2,
      escalaMin: 0,
      escalaMax: 10,
      opciones: ['Insuficiente', 'Aceptable', 'Buena', 'Excelente'],
    },
    { codigo: 'apto', nombre: 'Apto para defensa', tipo: 'BOOLEANO', peso: 0.2, escalaMin: 0, escalaMax: 10 },
    { codigo: 'observaciones', nombre: 'Observaciones generales', tipo: 'TEXTO', peso: 0, escalaMin: 0, escalaMax: 10 },
  ],
  umbralAprobacion: 6,
});

const ASIGNACION_ACTIVA: Asignacion = {
  id: 901,
  trabajoId: 9001,
  trabajoTitulo: 'Detección de anomalías en series temporales con autoencoders',
  versionamientoId: 8001,
  versionNumero: 2,
  evaluadorId: 1,
  evaluadorNombre: 'Evaluador Demo',
  templateSnapshot: TEMPLATE_SNAPSHOT,
  asignadaEn: '2026-06-14T10:00:00Z',
  vencimientoEn: '2026-06-25T23:59:00Z',
  estado: 'ACTIVA',
  createdAt: '2026-06-14T10:00:00Z',
};

const ASIGNACION_COMPLETADA: Asignacion = {
  id: 902,
  trabajoId: 9002,
  trabajoTitulo: 'Un marco de microservicios para sistemas académicos',
  versionamientoId: 8002,
  versionNumero: 1,
  evaluadorId: 1,
  evaluadorNombre: 'Evaluador Demo',
  templateSnapshot: TEMPLATE_SNAPSHOT,
  asignadaEn: '2026-05-20T10:00:00Z',
  vencimientoEn: '2026-06-05T23:59:00Z',
  estado: 'COMPLETADA',
  createdAt: '2026-05-20T10:00:00Z',
};

const EVALUACION_COMPLETADA: Evaluacion = {
  id: 7001,
  asignacionId: 902,
  estado: 'COMPLETADA',
  calificacionFinal: 7.13,
  comentarioGeneral: 'Trabajo sólido; recomendaría pulir la sección de resultados.',
  calificaciones: [
    { criterioCodigo: 'metodologia', puntaje: 8, comentario: 'Metodología clara.', comentarioPrivado: false },
    { criterioCodigo: 'originalidad', puntaje: 7, comentario: 'Aporte incremental.', comentarioPrivado: true },
    { criterioCodigo: 'claridad', puntaje: 6.67, comentario: 'Buena redacción.', comentarioPrivado: false },
    { criterioCodigo: 'apto', puntaje: 10, comentario: '', comentarioPrivado: false },
    { criterioCodigo: 'observaciones', puntaje: 0, comentario: 'Revisar referencias.', comentarioPrivado: true },
  ],
  completadaEn: '2026-06-02T15:30:00Z',
};

function ok<T>(body: T): Observable<HttpResponse<T>> {
  return of(new HttpResponse({ status: 200, body })).pipe(delay(250));
}

export const evaluacionesMockInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.mockEvaluaciones) return next(req);

  const path = req.url.replace(environment.apiBase, '');

  if (path.startsWith('/evaluador/me/asignaciones')) {
    const estado = req.params.get('estado');
    const todas = [ASIGNACION_ACTIVA, ASIGNACION_COMPLETADA];
    const body = estado ? todas.filter((a) => a.estado === estado) : todas;
    return ok(body);
  }

  if (path === '/api/asignaciones/901') return ok(ASIGNACION_ACTIVA);
  if (path === '/api/asignaciones/902') return ok(ASIGNACION_COMPLETADA);
  if (path === '/api/asignaciones/902/evaluacion') return ok(EVALUACION_COMPLETADA);

  if (req.method === 'POST' && path === '/api/evaluaciones') {
    return ok<Evaluacion>({
      ...EVALUACION_COMPLETADA,
      id: 7002,
      asignacionId: ASIGNACION_ACTIVA.id,
      completadaEn: new Date().toISOString(),
    });
  }

  return next(req);
};

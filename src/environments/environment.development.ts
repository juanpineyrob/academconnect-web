export const environment = {
  production: false,
  apiBase: 'http://localhost:8080',
  // Dev-only: sirve una asignación ACTIVA y una COMPLETADA mockeadas para probar
  // la cola de evaluación sin sembrar el backend. Poner en false para usar la API real.
  mockEvaluaciones: true,
};

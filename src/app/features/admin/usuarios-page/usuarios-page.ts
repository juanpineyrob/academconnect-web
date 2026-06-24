import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { Rol } from '@core/auth/models';
import { Button } from '@shared/ui/button/button';
import { AdminService } from '../admin.service';
import {
  AdminUsuario,
  AdminUsuarioCreateRequest,
  AdminUsuarioUpdateRequest,
} from '../admin.models';

const PAGE_SIZE = 10;

@Component({
  selector: 'ac-usuarios-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, Button],
  templateUrl: './usuarios-page.html',
  styleUrl: './usuarios-page.scss',
})
export class UsuariosPage {
  private readonly service = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly ROLES: ReadonlyArray<{ value: Rol; label: string }> = [
    { value: 'ESTUDIANTE', label: 'Estudiante' },
    { value: 'PROFESOR', label: 'Profesor' },
    { value: 'EXTERNO', label: 'Externo' },
    { value: 'ADMINISTRADOR', label: 'Administrador' },
  ];

  protected readonly usuarios = signal<AdminUsuario[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionId = signal<number | null>(null);
  protected readonly editId = signal<number | null>(null);
  protected readonly enviando = signal<boolean>(false);
  protected readonly enlaceOk = signal<string | null>(null);

  protected readonly page = signal<number>(0);
  protected readonly totalPages = signal<number>(0);
  protected readonly totalElements = signal<number>(0);
  protected readonly first = signal<boolean>(true);
  protected readonly last = signal<boolean>(true);

  protected readonly buscador = new FormControl('', { nonNullable: true });
  protected readonly filtroRol = new FormControl<Rol | ''>('', { nonNullable: true });

  protected readonly form = new FormGroup({
    rol: new FormControl<Rol>('ESTUDIANTE', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    matricula: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(30)] }),
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    edad: new FormControl<number | null>(null),
    ubicacion: new FormControl('', { nonNullable: true }),
    topeAsignaciones: new FormControl<number>(5, { nonNullable: true }),
    titulacion: new FormControl('', { nonNullable: true }),
    cargo: new FormControl('', { nonNullable: true }),
    institucion: new FormControl('', { nonNullable: true }),
    titulo: new FormControl('', { nonNullable: true }),
  });

  /** Rol seleccionado en el form (para mostrar campos de subtipo). */
  protected readonly rolForm = signal<Rol>('ESTUDIANTE');

  protected readonly editando = computed(() =>
    this.usuarios().find((u) => u.id === this.editId()) ?? null);

  constructor() {
    this.form.controls.rol.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((rol) => {
        this.rolForm.set(rol);
        this.aplicarValidadoresSubtipo(rol);
      });
    this.buscador.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.page.set(0); this.cargar(); });
    this.filtroRol.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.page.set(0); this.cargar(); });
    this.cargar();
  }

  private cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .buscarUsuarios({ q: this.buscador.value, rol: this.filtroRol.value, page: this.page(), size: PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          if (p.content.length === 0 && p.number > 0) {
            this.page.set(p.number - 1);
            this.cargar();
            return;
          }
          this.usuarios.set(p.content);
          this.totalPages.set(p.totalPages);
          this.totalElements.set(p.totalElements);
          this.first.set(p.first);
          this.last.set(p.last);
          this.page.set(p.number);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No se pudieron cargar los usuarios.');
          this.loading.set(false);
        },
      });
  }

  protected paginaAnterior(): void {
    if (this.first() || this.loading()) return;
    this.page.update((p) => p - 1);
    this.cargar();
  }

  protected paginaSiguiente(): void {
    if (this.last() || this.loading()) return;
    this.page.update((p) => p + 1);
    this.cargar();
  }

  private aplicarValidadoresSubtipo(rol: Rol): void {
    const inst = this.form.controls.institucion;
    const tit = this.form.controls.titulo;
    if (rol === 'EXTERNO') {
      inst.addValidators(Validators.required);
      tit.addValidators(Validators.required);
    } else {
      inst.removeValidators(Validators.required);
      tit.removeValidators(Validators.required);
    }
    inst.updateValueAndValidity({ emitEvent: false });
    tit.updateValueAndValidity({ emitEvent: false });
  }

  protected rolLabel(rol: Rol): string {
    return this.ROLES.find((r) => r.value === rol)?.label ?? rol;
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const id = this.editId();
    const obs = id
      ? this.service.actualizarUsuario(id, {
          email: v.email.trim(),
          matricula: v.matricula.trim(),
          nombre: v.nombre.trim(),
          edad: v.edad,
          ubicacion: v.ubicacion.trim() || null,
          topeAsignaciones: v.topeAsignaciones,
          titulacion: v.titulacion.trim() || null,
          cargo: v.cargo.trim() || null,
          institucion: v.institucion.trim() || null,
          titulo: v.titulo.trim() || null,
        } satisfies AdminUsuarioUpdateRequest)
      : this.service.crearUsuario({
          rol: v.rol,
          email: v.email.trim(),
          matricula: v.matricula.trim(),
          nombre: v.nombre.trim(),
          edad: v.edad,
          ubicacion: v.ubicacion.trim() || null,
          titulacion: v.titulacion.trim() || null,
          cargo: v.cargo.trim() || null,
          institucion: v.institucion.trim() || null,
          titulo: v.titulo.trim() || null,
        } satisfies AdminUsuarioCreateRequest);

    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.enviando.set(false);
        this.cancelarEdicion();
        this.cargar();
      },
      error: () => {
        this.enviando.set(false);
        this.error.set('No se pudo guardar. ¿El email ya está en uso?');
      },
    });
  }

  protected editar(u: AdminUsuario): void {
    this.editId.set(u.id);
    this.rolForm.set(u.rol);
    this.form.controls.rol.disable();
    this.form.patchValue({
      rol: u.rol,
      email: u.email,
      matricula: u.matricula ?? '',
      nombre: u.nombre,
      edad: u.edad,
      ubicacion: u.ubicacion ?? '',
      topeAsignaciones: u.topeAsignaciones,
      titulacion: u.titulacion ?? '',
      cargo: u.cargo ?? '',
      institucion: u.institucion ?? '',
      titulo: u.titulo ?? '',
    });
    this.aplicarValidadoresSubtipo(u.rol);
  }

  protected cancelarEdicion(): void {
    this.editId.set(null);
    this.form.controls.rol.enable();
    this.form.reset({
      rol: 'ESTUDIANTE', email: '', matricula: '', nombre: '', edad: null, ubicacion: '',
      topeAsignaciones: 5, titulacion: '', cargo: '', institucion: '', titulo: '',
    });
    this.rolForm.set('ESTUDIANTE');
  }

  protected toggleActivo(u: AdminUsuario): void {
    this.actionId.set(u.id);
    this.error.set(null);
    this.enlaceOk.set(null);
    const obs = u.activo ? this.service.desactivarUsuario(u.id) : this.service.activarUsuario(u.id);
    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.usuarios.update((list) => list.map((x) => (x.id === u.id ? { ...x, activo: updated.activo } : x)));
        this.actionId.set(null);
      },
      error: () => {
        this.error.set('No se pudo cambiar el estado (¿tu cuenta o el último admin?).');
        this.actionId.set(null);
      },
    });
  }

  protected enviarEnlace(id: number): void {
    this.actionId.set(id);
    this.error.set(null);
    this.enlaceOk.set(null);
    this.service
      .enviarEnlacePassword(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enlaceOk.set('Enlace de contraseña enviado al correo del usuario.');
          this.actionId.set(null);
        },
        error: () => {
          this.error.set('No se pudo enviar el enlace de contraseña.');
          this.actionId.set(null);
        },
      });
  }
}

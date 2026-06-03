import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Renderer2,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';

import { Button } from '@shared/ui/button/button';

const VIEW_SIZE_DESKTOP = 360;
const VIEW_SIZE_MOBILE = 280;
const MAX_SCALE_FACTOR = 4;
const ZOOM_STEP = 1.15;
const KEY_PAN_PX = 8;
const MOBILE_BREAKPOINT = 480;

@Component({
  selector: 'ac-avatar-cropper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  templateUrl: './avatar-cropper.html',
  styleUrl: './avatar-cropper.scss',
})
export class AvatarCropper implements AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly doc = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);

  readonly file = input.required<File>();
  readonly outputSize = input<number>(512);

  readonly closeRequested = output<void>();
  readonly apply = output<{ blob: Blob; previewUrl: string }>();

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly applyBtnRef = viewChild<ElementRef<HTMLElement>>('applyBtn');

  protected readonly imageReady = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly exporting = signal(false);
  protected readonly viewSize = signal(this.computeViewSize());

  private readonly naturalSize = signal<{ w: number; h: number } | null>(null);
  private readonly scaleFactor = signal(1);
  private readonly offset = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  private image: HTMLImageElement | null = null;
  private imageObjectUrl: string | null = null;
  private dragging = false;
  private lastPointer: { x: number; y: number } | null = null;
  private activePointerId: number | null = null;

  private readonly minScale = computed(() => {
    const n = this.naturalSize();
    if (!n) return 1;
    const v = this.viewSize();
    return Math.max(v / n.w, v / n.h);
  });

  protected readonly canZoomOut = computed(() => this.scaleFactor() > 1.001);
  protected readonly canZoomIn = computed(() => this.scaleFactor() < MAX_SCALE_FACTOR - 0.001);

  private readonly renderEffect = effect(() => {
    // Track all reactive deps explicitly:
    this.naturalSize();
    this.scaleFactor();
    this.offset();
    this.viewSize();
    if (this.imageReady()) this.draw();
  });

  constructor() {
    fromEvent<KeyboardEvent>(this.doc, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => this.onKeydown(e));

    fromEvent<UIEvent>(this.doc.defaultView ?? window, 'resize')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.viewSize.set(this.computeViewSize()));

    this.renderer.addClass(this.doc.body, 'ac-no-scroll');

    this.destroyRef.onDestroy(() => {
      this.renderer.removeClass(this.doc.body, 'ac-no-scroll');
      if (this.imageObjectUrl) URL.revokeObjectURL(this.imageObjectUrl);
    });
  }

  ngAfterViewInit(): void {
    this.loadImage();
    queueMicrotask(() => this.applyBtnRef()?.nativeElement.focus());
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeRequested.emit();
  }

  protected onCancel(): void {
    this.closeRequested.emit();
  }

  protected onZoomIn(): void {
    this.setEffectiveScale(this.effectiveScale() * ZOOM_STEP);
  }

  protected onZoomOut(): void {
    this.setEffectiveScale(this.effectiveScale() / ZOOM_STEP);
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const next = this.effectiveScale() * (1 - event.deltaY * 0.0015);
    this.setEffectiveScale(next);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.imageReady()) return;
    const target = event.target as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    this.dragging = true;
    this.activePointerId = event.pointerId;
    this.lastPointer = { x: event.clientX, y: event.clientY };
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging || event.pointerId !== this.activePointerId) return;
    if (!this.lastPointer) return;
    const dx = event.clientX - this.lastPointer.x;
    const dy = event.clientY - this.lastPointer.y;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    const cur = this.offset();
    this.offset.set(this.clampOffset({ x: cur.x + dx, y: cur.y + dy }));
  }

  protected onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return;
    this.dragging = false;
    this.activePointerId = null;
    this.lastPointer = null;
  }

  protected async onApply(): Promise<void> {
    if (!this.image || !this.imageReady() || this.exporting()) return;
    this.exporting.set(true);
    try {
      const blob = await this.exportBlob();
      if (!blob) {
        this.loadError.set('No pudimos generar la imagen. Probá de nuevo.');
        this.exporting.set(false);
        return;
      }
      const previewUrl = URL.createObjectURL(blob);
      this.apply.emit({ blob, previewUrl });
    } catch {
      this.loadError.set('No pudimos generar la imagen. Probá de nuevo.');
      this.exporting.set(false);
    }
  }

  private computeViewSize(): number {
    const win = this.doc.defaultView;
    if (!win) return VIEW_SIZE_DESKTOP;
    if (win.innerWidth <= MOBILE_BREAKPOINT) {
      return Math.min(win.innerWidth - 64, VIEW_SIZE_MOBILE);
    }
    return VIEW_SIZE_DESKTOP;
  }

  private loadImage(): void {
    const f = this.file();
    const url = URL.createObjectURL(f);
    this.imageObjectUrl = url;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      this.image = img;
      this.naturalSize.set({ w: img.naturalWidth, h: img.naturalHeight });
      this.scaleFactor.set(1);
      this.offset.set({ x: 0, y: 0 });
      this.imageReady.set(true);
    };
    img.onerror = () => {
      this.loadError.set('No pudimos leer esta imagen. Probá con otra.');
    };
    img.src = url;
  }

  private effectiveScale(): number {
    return this.minScale() * this.scaleFactor();
  }

  private setEffectiveScale(nextEffective: number): void {
    const min = this.minScale();
    const maxEffective = min * MAX_SCALE_FACTOR;
    const clamped = Math.min(Math.max(nextEffective, min), maxEffective);
    this.scaleFactor.set(clamped / min);
    this.offset.set(this.clampOffset(this.offset()));
  }

  private clampOffset(o: { x: number; y: number }): { x: number; y: number } {
    const n = this.naturalSize();
    if (!n) return { x: 0, y: 0 };
    const s = this.effectiveScale();
    const v = this.viewSize();
    const maxX = Math.max(0, (n.w * s - v) / 2);
    const maxY = Math.max(0, (n.h * s - v) / 2);
    return {
      x: Math.min(Math.max(o.x, -maxX), maxX),
      y: Math.min(Math.max(o.y, -maxY), maxY),
    };
  }

  private draw(): void {
    const canvasEl = this.canvasRef()?.nativeElement;
    const img = this.image;
    const n = this.naturalSize();
    if (!canvasEl || !img || !n) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const v = this.viewSize();
    const dpr = this.doc.defaultView?.devicePixelRatio ?? 1;
    if (canvasEl.width !== v * dpr || canvasEl.height !== v * dpr) {
      canvasEl.width = v * dpr;
      canvasEl.height = v * dpr;
    }
    canvasEl.style.width = `${v}px`;
    canvasEl.style.height = `${v}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const s = this.effectiveScale();
    const drawW = n.w * s;
    const drawH = n.h * s;
    const off = this.offset();
    const left = v / 2 + off.x - drawW / 2;
    const top = v / 2 + off.y - drawH / 2;

    ctx.fillStyle = '#0a1f44';
    ctx.fillRect(0, 0, v, v);
    ctx.drawImage(img, left, top, drawW, drawH);

    ctx.save();
    ctx.fillStyle = 'rgba(10, 31, 68, 0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, v, v);
    ctx.arc(v / 2, v / 2, v / 2, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(v / 2, v / 2, v / 2 - 1, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(247, 245, 240, 0.9)';
    ctx.stroke();
    ctx.restore();
  }

  private exportBlob(): Promise<Blob | null> {
    const img = this.image;
    const n = this.naturalSize();
    if (!img || !n) return Promise.resolve(null);

    const v = this.viewSize();
    const s = this.effectiveScale();
    const off = this.offset();
    const sourceX = n.w / 2 - v / (2 * s) - off.x / s;
    const sourceY = n.h / 2 - v / (2 * s) - off.y / s;
    const sourceSize = v / s;

    const out = this.doc.createElement('canvas') as HTMLCanvasElement;
    const size = this.outputSize();
    out.width = size;
    out.height = size;
    const octx = out.getContext('2d');
    if (!octx) return Promise.resolve(null);

    octx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

    return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
  }

  private onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.closeRequested.emit();
      return;
    }
    if (!this.imageReady()) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.onZoomIn();
      return;
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.onZoomOut();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = this.offset();
      const dx = e.key === 'ArrowLeft' ? -KEY_PAN_PX : e.key === 'ArrowRight' ? KEY_PAN_PX : 0;
      const dy = e.key === 'ArrowUp' ? -KEY_PAN_PX : e.key === 'ArrowDown' ? KEY_PAN_PX : 0;
      this.offset.set(this.clampOffset({ x: cur.x + dx, y: cur.y + dy }));
    }
  }
}

import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import QRCode from 'qrcode';
import { DEFAULT_MAX_CHUNK_BYTES, splitTextIntoUtf8Chunks } from './text-chunks';

export interface QrSlide {
  partNumber: number;
  totalParts: number;
  safeSrc: SafeUrl;
}

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly sanitizer = inject(DomSanitizer);

  readonly inputText = signal('');
  readonly slides = signal<QrSlide[]>([]);
  readonly currentIndex = signal(0);
  readonly generating = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly currentSlide = computed(() => {
    const list = this.slides();
    const i = this.currentIndex();
    if (list.length === 0 || i < 0 || i >= list.length) {
      return null;
    }
    return list[i]!;
  });

  readonly hasSlides = computed(() => this.slides().length > 0);
  readonly fullscreenOpen = signal(false);

  private readonly fullscreenHost = viewChild<ElementRef<HTMLElement>>('fullscreenHost');
  private touchStartX = 0;

  onInput(value: string): void {
    this.inputText.set(value);
  }

  async generate(): Promise<void> {
    const raw = this.inputText().trim();
    this.errorMessage.set(null);
    if (!raw) {
      this.slides.set([]);
      this.currentIndex.set(0);
      this.errorMessage.set('Вставьте текст.');
      return;
    }

    const parts = splitTextIntoUtf8Chunks(raw, DEFAULT_MAX_CHUNK_BYTES);
    this.generating.set(true);
    this.slides.set([]);
    this.currentIndex.set(0);

    try {
      const total = parts.length;
      const built: QrSlide[] = [];
      for (let i = 0; i < total; i++) {
        const chunk = parts[i]!;
        const dataUrl = await QRCode.toDataURL(chunk, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 480,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        built.push({
          partNumber: i + 1,
          totalParts: total,
          safeSrc: this.sanitizer.bypassSecurityTrustUrl(dataUrl),
        });
      }
      this.slides.set(built);
      this.currentIndex.set(0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.errorMessage.set(`Не удалось создать QR: ${msg}`);
    } finally {
      this.generating.set(false);
    }
  }

  prev(): void {
    const n = this.slides().length;
    if (n === 0) return;
    this.currentIndex.update((i) => (i - 1 + n) % n);
  }

  next(): void {
    const n = this.slides().length;
    if (n === 0) return;
    this.currentIndex.update((i) => (i + 1) % n);
  }

  openFullscreen(): void {
    if (!this.hasSlides()) return;
    this.fullscreenOpen.set(true);
    setTimeout(() => {
      const el = this.fullscreenHost()?.nativeElement;
      if (el?.requestFullscreen) {
        void el.requestFullscreen().catch(() => undefined);
      }
    }, 0);
  }

  closeFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    this.fullscreenOpen.set(false);
  }

  onTouchStart(ev: TouchEvent): void {
    if (ev.touches.length > 0) {
      this.touchStartX = ev.touches[0]!.clientX;
    }
  }

  onTouchEnd(ev: TouchEvent): void {
    if (ev.changedTouches.length === 0) return;
    const dx = ev.changedTouches[0]!.clientX - this.touchStartX;
    const threshold = 56;
    if (dx > threshold) this.prev();
    else if (dx < -threshold) this.next();
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    if (!document.fullscreenElement && this.fullscreenOpen()) {
      this.fullscreenOpen.set(false);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(ev: KeyboardEvent): void {
    if (this.fullscreenOpen()) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        this.closeFullscreen();
        return;
      }
    }

    if (!this.hasSlides()) return;

    const navigate = this.fullscreenOpen() || !this.isTypingTarget(ev.target);
    if (!navigate) return;

    if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      this.prev();
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      this.next();
    }
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'TEXTAREA' || tag === 'INPUT' || target.isContentEditable;
  }
}

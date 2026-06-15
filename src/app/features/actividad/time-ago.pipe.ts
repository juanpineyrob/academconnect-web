import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'timeAgo', pure: true })
export class TimeAgoPipe implements PipeTransform {
  transform(iso: string | null | undefined): string {
    if (!iso) return '';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    const deltaSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (deltaSec < 60) return 'ahora';
    const min = Math.floor(deltaSec / 60);
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `hace ${d} d`;
    const sem = Math.floor(d / 7);
    return `hace ${sem} sem`;
  }
}

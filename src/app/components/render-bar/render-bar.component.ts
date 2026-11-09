import { Component, computed, inject } from '@angular/core';
import { LucideCheck, LucideLoaderCircle, LucidePlay, LucideTriangleAlert, LucideX } from '@lucide/angular';
import { RenderService } from '../../services/render.service';

@Component({
  selector: 'app-render-bar',
  imports: [LucideCheck, LucideLoaderCircle, LucidePlay, LucideTriangleAlert, LucideX],
  templateUrl: './render-bar.component.html',
})
export class RenderBar {
  protected renderer = inject(RenderService);

  protected progress = computed(() => {
    const progress = this.renderer.progress();
    if (!progress) {
      return undefined;
    }
    const percent = Math.round(((progress.index + progress.fraction) / progress.count) * 100);
    return { ...progress, percent: Math.min(percent, 100) };
  });
}

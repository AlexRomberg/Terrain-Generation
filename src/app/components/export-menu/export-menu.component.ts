import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { Component, computed, inject, signal } from '@angular/core';
import { LucideDownload, LucideLoaderCircle, LucideTriangleAlert } from '@lucide/angular';
import { ExportFormat } from '../../render/exporters';
import { ExportService } from '../../services/export.service';
import { RenderService } from '../../services/render.service';

const MENU_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'end', overlayY: 'bottom', offsetX: -8 },
];

@Component({
  selector: 'app-export-menu',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger, LucideDownload, LucideLoaderCircle, LucideTriangleAlert],
  templateUrl: './export-menu.component.html',
})
export class ExportMenu {
  private readonly renderer = inject(RenderService);
  protected readonly exporter = inject(ExportService);

  protected readonly open = signal(false);
  protected readonly positions = MENU_POSITIONS;
  protected readonly result = computed(() => this.renderer.rendered()?.steps.at(-1)?.result);
  protected readonly formats = computed<ExportFormat[]>(() =>
    this.result()?.color ? ['stl', 'obj', 'heightmap', 'colormap'] : ['stl', 'obj', 'heightmap'],
  );
}

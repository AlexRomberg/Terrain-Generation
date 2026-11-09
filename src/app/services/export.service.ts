import { inject, Service, signal } from '@angular/core';
import { LayerImage } from '../models/layerImage';
import { ExportFormat } from '../render/exporters';
import { RenderRequestKind, RenderResponseKind, runWorker } from '../render/renderProtocol';
import { RenderService } from './render.service';

const FILE_NAMES: Record<ExportFormat, string> = {
  stl: 'terrain.stl',
  obj: 'terrain.obj',
  heightmap: 'heightmap.png',
  colormap: 'colormap.png',
};

@Service()
export class ExportService {
  private readonly renderer = inject(RenderService);
  readonly busy = signal(false);
  readonly error = signal<string | undefined>(undefined);

  getFileName(format: ExportFormat) {
    return FILE_NAMES[format];
  }

  async export(format: ExportFormat) {
    const image = this.renderer.rendered()?.steps.at(-1)?.result;
    if (!image || this.busy()) {
      return;
    }

    const name = this.getFileName(format);
    this.error.set(undefined);
    this.busy.set(true);
    try {
      download(await this.run(image, format), name);
    } catch (error) {
      this.error.set(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.busy.set(false);
    }
  }

  private async run(image: LayerImage, format: ExportFormat) {
    let file: Blob | undefined;
    await runWorker({ kind: RenderRequestKind.Export, image, format }, (message) => {
      if (message.kind === RenderResponseKind.Export) {
        file = message.file;
      }
    });
    if (!file) {
      throw new Error('The export produced no file');
    }
    return file;
  }
}

function download(file: Blob, name: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

import { inject, Service, signal } from '@angular/core';
import { LayerImage } from '../models/layerImage';
import { ExportFormat } from '../render/exporters';
import { RenderRequestKind, RenderResponseKind, runWorker } from '../render/renderProtocol';
import { RenderService } from './render.service';

const LAYER_IMAGE_FORMATS = ['heightmap', 'colormap'] as const;

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

  // HACK (ARO): This is for documentation use, exposed on window scope
  async layers() {
    const rendered = this.renderer.rendered();
    if (!rendered?.complete) {
      throw new Error('Render the full terrain first; only the final result is currently available');
    }
    const abort = new AbortController();
    return Promise.all(
      rendered.steps.map(async (step, index) => [
        step.result,
        ...(await this.renderer.layersFor(step, rendered.steps[index - 1]?.result, abort.signal)),
      ]),
    );
  }

  // HACK (ARO): This is for documentation use, exposed on window scope
  async exportImage(image: LayerImage, name = slug(image.label)) {
    for (const format of LAYER_IMAGE_FORMATS) {
      if (format === 'heightmap' || image.color) {
        download(await this.run(image, format), `${name}-${format}.png`);
      }
    }
  }

  // HACK (ARO): This is for documentation use, exposed on window scope
  async exportAllLayers() {
    for (const [index, images] of (await this.layers()).entries()) {
      for (const [layerIndex, image] of images.entries()) {
        await this.exportImage(image, `${index}-${layerIndex}-${slug(image.label)}`);
      }
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

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layer';
}

function download(file: Blob, name: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

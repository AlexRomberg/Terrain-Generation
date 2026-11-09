import { byteSize, LayerImage } from '../models/layerImage';

interface CacheEntry {
  images: LayerImage[];
  bytes: number;
}

export class StepCache {
  private readonly entries = new Map<string, CacheEntry>();
  private pinned = new Set<string>();
  private totalBytes = 0;

  constructor(private readonly budgetBytes: number) { }

  result(key: string) {
    return this.get(resultId(key))?.[0];
  }

  layers(key: string) {
    return this.get(layersId(key));
  }

  setResult(key: string, image: LayerImage) {
    this.set(resultId(key), [image]);
  }

  setLayers(key: string, layers: LayerImage[]) {
    this.set(layersId(key), layers);
  }

  pin(keys: readonly string[]) {
    this.pinned = new Set(keys.flatMap((key) => [resultId(key), layersId(key)]));
    this.cleanup();
  }

  private get(id: string) {
    const entry = this.entries.get(id);
    if (entry) {
      this.entries.delete(id);
      this.entries.set(id, entry);
    }
    return entry?.images;
  }

  private set(id: string, images: LayerImage[]) {
    const existing = this.entries.get(id);
    if (existing) {
      this.entries.delete(id);
      this.totalBytes -= existing.bytes;
    }
    const entry = { images, bytes: byteSize(images) };
    this.entries.set(id, entry);
    this.totalBytes += entry.bytes;
    this.cleanup();
  }

  private cleanup() {
    for (const [id, entry] of this.entries) {
      if (this.totalBytes <= this.budgetBytes) {
        return;
      }
      if (!this.pinned.has(id)) {
        this.entries.delete(id);
        this.totalBytes -= entry.bytes;
      }
    }
  }
}

function resultId(key: string) {
  return `${key}:result`;
}

function layersId(key: string) {
  return `${key}:layers`;
}

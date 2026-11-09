import { inject, Service, signal } from '@angular/core';
import { finalKey, pipelineSteps } from '../models/pipelineConfig';
import { LayerState } from './layer-state.service';
import { LibraryEntry, LibraryStore, StoredResult } from './library-store';
import { RenderService } from './render.service';

export type ThumbnailCapture = () => string | undefined;

@Service()
export class LibraryService {
  private readonly store = new LibraryStore();
  private readonly state = inject(LayerState);
  private readonly renderer = inject(RenderService);

  readonly entries = signal<readonly LibraryEntry[]>([]);
  readonly activeId = signal<string | undefined>(undefined);
  readonly busy = signal(false);
  readonly message = signal<string | undefined>(undefined);

  constructor() {
    this.refresh();
  }

  async apply(entry: LibraryEntry) {
    this.message.set(undefined);
    this.state.restore(entry.config);
    this.activeId.set(entry.id);

    const key = finalKey(pipelineSteps(entry.config));
    if (key && !this.renderer.cachedResult(key)) {
      try {
        const stored = await this.store.loadResult(entry.id);
        if (stored?.key === key) {
          this.renderer.storeResult(key, stored.result);
        }
      } catch (error) {
        this.message.set(`The stored result could not be loaded: ${describe(error)}`);
      }
    }

    await this.renderer.showResult();
  }

  async save(name: string, capture: ThumbnailCapture) {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.message.set(undefined);

    try {
      if ((this.renderer.isDirty() || !this.renderer.rendered()) && !(await this.renderer.render())) {
        return;
      }
      const rendered = this.renderer.rendered()!;
      const top = rendered.steps[rendered.steps.length - 1];
      const entry: LibraryEntry = {
        id: crypto.randomUUID(),
        name,
        createdAt: Date.now(),
        config: this.renderer.isDirty() ? rendered.config : this.state.snapshot(),
        thumbnail: capture(),
      };
      await this.persist(entry, { id: entry.id, key: top.spec.key, result: top.result });
      this.entries.update((entries) => [...entries, entry]);
      this.activeId.set(entry.id);
    } catch (error) {
      this.message.set(`Saving failed: ${describe(error)}`);
    } finally {
      this.busy.set(false);
    }
  }

  async rename(entry: LibraryEntry, name: string) {
    const renamed = { ...entry, name };
    try {
      await this.store.save(renamed);
      this.entries.update((entries) => entries.map((existing) => (existing.id === entry.id ? renamed : existing)));
    } catch (error) {
      this.message.set(`Renaming failed: ${describe(error)}`);
    }
  }

  async delete(entry: LibraryEntry) {
    try {
      await this.store.delete(entry.id);
      this.entries.update((entries) => entries.filter(({ id }) => id !== entry.id));
      if (this.activeId() === entry.id) {
        this.activeId.set(undefined);
      }
    } catch (error) {
      this.message.set(`Deleting failed: ${describe(error)}`);
    }
  }

  private async persist(entry: LibraryEntry, result: StoredResult) {
    navigator.storage?.persist?.().catch(() => false);
    try {
      await this.store.save(entry, result);
    } catch (error) {
      await this.store.save(entry);
      this.message.set(`The result could not be stored (${describe(error)}), saved the parameters only.`);
    }
  }

  private async refresh() {
    try {
      const entries = await this.store.list();
      this.entries.set(entries.sort((a, b) => a.createdAt - b.createdAt));
    } catch (error) {
      this.message.set(`The presets could not be loaded: ${describe(error)}`);
    }
  }
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

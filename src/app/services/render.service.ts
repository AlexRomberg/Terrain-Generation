import { computed, inject, Service, signal } from '@angular/core';
import { LayerImage } from '../models/layerImage';
import { finalKey, PipelineConfig, pipelineSteps, StepSpec } from '../models/pipelineConfig';
import {
  RenderRequest,
  RenderRequestKind,
  RenderResponse,
  RenderResponseKind,
  runWorker,
  WorkerError,
} from '../render/renderProtocol';
import { LayerState } from './layer-state.service';
import { StepCache } from './step-cache';

const CACHE_BUDGET_BYTES = 1024 ** 3;

export interface RenderedStep {
  spec: StepSpec;
  result: LayerImage;
}

export interface RenderedState {
  config: PipelineConfig;
  steps: RenderedStep[];
  complete: boolean;
}

export interface RenderProgress {
  label: string;
  index: number;
  count: number;
  fraction: number;
}

interface ForegroundJobOptions {
  request: RenderRequest;
  count: number;
  offset: number;
  label: (index: number) => string;
  onResult: (message: RenderResponse) => void;
}

@Service()
export class RenderService {
  private readonly state = inject(LayerState);
  private readonly cache = new StepCache(CACHE_BUDGET_BYTES);
  private job?: AbortController;
  private generation = 0;

  readonly rendered = signal<RenderedState | undefined>(undefined);
  readonly progress = signal<RenderProgress | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);
  private readonly draftSteps = computed(() => pipelineSteps(this.state.snapshot()));
  readonly isDirty = computed(
    () => finalKey(this.draftSteps()) !== finalKey(this.rendered()?.steps.map((step) => step.spec) ?? []),
  );
  readonly needsRender = computed(() => this.isDirty() || !this.rendered()?.complete);

  constructor() {
    queueMicrotask(() => this.render());
  }

  async render() {
    const generation = this.startForeground();
    this.error.set(undefined);
    const config = this.state.snapshot();
    const steps = pipelineSteps(config);
    const results = steps.map((step) => this.cache.result(step.key));
    const start = results.findIndex((result) => !result);
    const end = results.length - 1 - [...results].reverse().findIndex((result) => !result);

    if (start >= 0) {
      const success = await this.runPipeline(steps, start, end, results);
      if (!success || generation !== this.generation) {
        return false;
      }
    }

    this.cache.pin(steps.map((step) => step.key));
    this.rendered.set({
      config,
      steps: steps.map((spec, index) => ({ spec, result: results[index]! })),
      complete: true,
    });
    return true;
  }

  async showResult() {
    const config = this.state.snapshot();
    const steps = pipelineSteps(config);
    const last = steps[steps.length - 1];
    const result = this.cache.result(last.key);
    if (!result || steps.every((step) => this.cache.result(step.key))) {
      return this.render();
    }

    this.startForeground();
    this.error.set(undefined);
    this.cache.pin(steps.map((step) => step.key));
    this.rendered.set({ config, steps: [{ spec: last, result }], complete: false });
    return true;
  }

  cancel() {
    this.job?.abort();
  }

  cachedResult(key: string) {
    return this.cache.result(key);
  }

  storeResult(key: string, result: LayerImage) {
    this.cache.setResult(key, result);
  }

  async layersFor(step: RenderedStep, input: LayerImage | undefined, abortSignal: AbortSignal) {
    const cached = this.cache.layers(step.spec.key);
    if (cached) {
      return cached;
    }
    let layers: LayerImage[] = [];
    await runWorker(
      { kind: RenderRequestKind.Layers, jobs: [{ spec: step.spec, input }] },
      (message) => {
        if (message.kind === RenderResponseKind.Layers) {
          layers = message.layers;
        }
      },
      abortSignal,
    );
    this.cache.setLayers(step.spec.key, layers);
    return layers;
  }

  private runPipeline(steps: StepSpec[], start: number, end: number, results: (LayerImage | undefined)[]) {
    const remaining = steps.slice(start, end + 1);
    return this.runForeground({
      request: { kind: RenderRequestKind.Pipeline, steps: remaining, input: results[start - 1] },
      count: steps.length,
      offset: start,
      label: (index) => remaining[index].name,
      onResult: (message) => {
        if (message.kind === RenderResponseKind.Step) {
          results[start + message.index] = message.result;
          this.cache.setResult(remaining[message.index].key, message.result);
        }
      },
    });
  }

  private startForeground() {
    this.cancel();
    return ++this.generation;
  }

  private async runForeground({ request, count, offset, label, onResult }: ForegroundJobOptions) {
    const job = new AbortController();
    this.job = job;
    this.progress.set({ label: label(0), index: offset, count, fraction: 0 });

    try {
      await runWorker(
        request,
        (message) => {
          if (message.kind === RenderResponseKind.Progress) {
            this.progress.set({ label: label(message.index), index: offset + message.index, count, fraction: message.fraction });
          } else {
            onResult(message);
          }
        },
        job.signal,
      );
      return true;
    } catch (error) {
      if (!job.signal.aborted) {
        this.error.set(error instanceof WorkerError ? `${label(error.index)}: ${error.message}` : String(error));
      }
      return false;
    } finally {
      if (this.job === job) {
        this.job = undefined;
        this.progress.set(undefined);
      }
    }
  }
}

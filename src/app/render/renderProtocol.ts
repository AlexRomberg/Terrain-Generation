import { LayerImage } from '../models/layerImage';
import { StepSpec } from '../models/pipelineConfig';
import { ExportFormat } from './exporters';

export interface StepJob {
  spec: StepSpec;
  input?: LayerImage;
}

export enum RenderRequestKind {
  Pipeline = 'pipeline',
  Layers = 'layers',
  Export = 'export',
}

export enum RenderResponseKind {
  Progress = 'progress',
  Step = 'step',
  Layers = 'layers',
  Export = 'export',
  Error = 'error',
  Done = 'done',
}

export type RenderRequest =
  | { kind: RenderRequestKind.Pipeline; steps: StepSpec[]; input?: LayerImage }
  | { kind: RenderRequestKind.Layers; jobs: StepJob[] }
  | { kind: RenderRequestKind.Export; image: LayerImage; format: ExportFormat };

export type RenderResponse =
  | { kind: RenderResponseKind.Progress; index: number; fraction: number }
  | { kind: RenderResponseKind.Step; index: number; result: LayerImage }
  | { kind: RenderResponseKind.Layers; index: number; layers: LayerImage[] }
  | { kind: RenderResponseKind.Export; file: Blob }
  | { kind: RenderResponseKind.Error; index: number; message: string }
  | { kind: RenderResponseKind.Done };

export class WorkerError extends Error {
  constructor(
    message: string,
    readonly index: number,
  ) {
    super(message);
  }
}

export function runWorker(
  request: RenderRequest,
  onMessage: (message: RenderResponse) => void,
  abortSignal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    abortSignal?.throwIfAborted();
    const worker = new Worker(new URL('./render.worker', import.meta.url), { type: 'module' });
    const settle = (finish: () => void) => {
      worker.terminate();
      abortSignal?.removeEventListener('abort', abort);
      finish();
    };
    const abort = () => settle(() => reject(abortSignal?.reason));

    abortSignal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<RenderResponse>) => {
      if (data.kind === RenderResponseKind.Done) {
        settle(() => resolve());
      } else if (data.kind === RenderResponseKind.Error) {
        settle(() => reject(new WorkerError(data.message, data.index)));
      } else {
        onMessage(data);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      settle(() => reject(new Error(event.message || 'The render worker crashed')));
    };
    worker.postMessage(request);
  });
}

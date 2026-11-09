/// <reference lib="webworker" />

import { ProgressReporter, RenderContext } from '../models/layerDefinition';
import { buffersOf, LayerImage, zeroElevation } from '../models/layerImage';
import { findLayer } from '../models/layerRegistry';
import { StepSpec } from '../models/pipelineConfig';
import { ExportFormat, exportTerrain } from './exporters';
import { RenderRequest, RenderRequestKind, RenderResponse, RenderResponseKind, StepJob } from './renderProtocol';

const PROGRESS_INTERVAL_MS = 50;

addEventListener('message', async ({ data }: MessageEvent<RenderRequest>) => {
  const completed = await run(data);
  if (completed) {
    post({ kind: RenderResponseKind.Done });
  }
});

function run(request: RenderRequest) {
  switch (request.kind) {
    case RenderRequestKind.Pipeline:
      return runPipeline(request.steps, request.input);
    case RenderRequestKind.Layers:
      return runLayers(request.jobs);
    case RenderRequestKind.Export:
      return runExport(request.image, request.format);
  }
}

async function runExport(image: LayerImage, format: ExportFormat) {
  try {
    const file = await exportTerrain(image, format);
    post({ kind: RenderResponseKind.Export, file });
    return true;
  } catch (error) {
    post({ kind: RenderResponseKind.Error, index: 0, message: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

function runPipeline(steps: StepSpec[], input?: LayerImage) {
  let source = input;
  for (const [index, spec] of steps.entries()) {
    const result = attempt(index, () => zeroElevation(renderStep(spec, source, reporter(index))));
    if (!result) {
      return false;
    }
    const isLast = index === steps.length - 1;
    post({ kind: RenderResponseKind.Step, index, result }, isLast ? transferablesOf([result]) : []);
    source = result;
  }
  return true;
}

function runLayers(jobs: StepJob[]) {
  for (const [index, { spec, input }] of jobs.entries()) {
    const layers = attempt(index, () => renderStepLayers(spec, input, reporter(index)));
    if (!layers) {
      return false;
    }
    post({ kind: RenderResponseKind.Layers, index, layers }, transferablesOf(layers));
  }
  return true;
}

function renderStep(spec: StepSpec, source: LayerImage | undefined, report: ProgressReporter) {
  const definition = getDefinitionOf(spec);
  const context: RenderContext = { seed: spec.seed, report };
  report(0);
  if (definition.role === 'base') {
    return definition.render(spec.params, context);
  }
  return definition.render(requireSource(source), spec.params, context);
}

function renderStepLayers(spec: StepSpec, source: LayerImage | undefined, report: ProgressReporter) {
  const definition = getDefinitionOf(spec);
  const context: RenderContext = { seed: spec.seed, report };
  report(0);
  if (definition.role === 'base') {
    return definition.renderLayers(spec.params, context);
  }
  return definition.renderLayers(requireSource(source), spec.params, context);
}

function getDefinitionOf(spec: StepSpec) {
  const definition = findLayer(spec.type);
  if (!definition) {
    throw new Error(`Unknown layer type "${spec.type}"`);
  }
  return definition;
}

function requireSource(source: LayerImage | undefined) {
  if (!source) {
    throw new Error('Missing input layer');
  }
  return source;
}

function attempt<T>(index: number, run: () => T): T | undefined {
  try {
    return run();
  } catch (error) {
    post({ kind: RenderResponseKind.Error, index, message: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

function reporter(index: number): ProgressReporter {
  let lastPost = -Infinity;
  return (fraction) => {
    const now = performance.now();
    if (now - lastPost >= PROGRESS_INTERVAL_MS) {
      lastPost = now;
      post({ kind: RenderResponseKind.Progress, index, fraction });
    }
  };
}

function transferablesOf(images: LayerImage[]) {
  return [...buffersOf(images)] as ArrayBuffer[];
}

function post(message: RenderResponse, transfer: Transferable[] = []) {
  postMessage(message, transfer);
}

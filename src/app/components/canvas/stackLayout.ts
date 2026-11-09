import { LayerImage } from '../../models/layerImage';
import { RenderedStep } from '../../services/render.service';

export interface StackEntry {
  id: string;
  label: string;
  image: LayerImage;
  focusable: boolean;
  parent?: string;
}

export interface StackLayout {
  planes: StackEntry[];
  focus?: string;
}

export interface FocusedLayers {
  id: string;
  layers: LayerImage[];
}

export function buildStackLayout(
  steps: readonly RenderedStep[],
  focusedId?: string,
  focusedLayers?: FocusedLayers,
  focusable = true,
): StackLayout {
  const focused = focusable ? steps.find((step) => step.spec.id === focusedId) : undefined;
  if (!focused) {
    return overviewLayout(steps, focusable);
  }
  const layers = focusedLayers?.id === focused.spec.id ? focusedLayers.layers : [];
  return focusedLayout(focused, layers);
}

function overviewLayout(steps: readonly RenderedStep[], focusable: boolean): StackLayout {
  return { planes: steps.map((step) => stepEntry(step, focusable)) };
}

function focusedLayout(step: RenderedStep, layers: LayerImage[]): StackLayout {
  const sublayers = layers.map((image, index) => ({
    id: `${step.spec.id}:${index}`,
    label: image.label,
    image,
    focusable: false,
    parent: step.spec.id,
  }));
  return { focus: step.spec.id, planes: [...sublayers, stepEntry(step)] };
}

function stepEntry(step: RenderedStep, focusable = true): StackEntry {
  return { id: step.spec.id, label: step.spec.name, image: step.result, focusable };
}

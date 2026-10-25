import { LayerImage } from '../../models/layerImage';
import { LayerStep } from '../../services/layer-pipeline.service';

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

export function buildStackLayout(steps: readonly LayerStep[], focusedId?: string): StackLayout {
  const focused = steps.find((step) => step.id === focusedId);
  return focused ? focusedLayout(focused) : overviewLayout(steps);
}

function overviewLayout(steps: readonly LayerStep[]): StackLayout {
  return { planes: steps.map((step) => stepEntry(step)) };
}

function focusedLayout(step: LayerStep): StackLayout {
  const sublayers = step.renderLayers().map((image, index) => ({
    id: `${step.id}:${index}`,
    label: image.label,
    image,
    focusable: false,
    parent: step.id,
  }));
  return { focus: step.id, planes: [...sublayers, stepEntry(step)] };
}

function stepEntry(step: LayerStep): StackEntry {
  return { id: step.id, label: step.name, image: step.result, focusable: true };
}

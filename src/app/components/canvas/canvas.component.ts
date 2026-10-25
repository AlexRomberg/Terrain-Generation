import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { LucideListChevronsDownUp, LucideListChevronsUpDown, LucideX } from '@lucide/angular';
import { LayerPipeline } from '../../services/layer-pipeline.service';
import { StackLabel } from './scene/layerStack';
import { TerrainView } from './scene/terrainView';
import { buildStackLayout } from './stackLayout';

const LABEL_GAP = 16;

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  host: {
    class: 'relative block size-full',
  },
  imports: [LucideListChevronsUpDown, LucideListChevronsDownUp, LucideX],
})
export class Canvas {
  private canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvasRef');
  private labelRefs = viewChildren<ElementRef<HTMLElement>>('layerLabel');
  private pipeline = inject(LayerPipeline);
  private view = signal<TerrainView | undefined>(undefined);

  protected layersVisible = signal(false);
  protected focusedLayer = signal<string | undefined>(undefined);
  protected labels = signal<StackLabel[]>([]);

  private stackLayout = computed(() =>
    this.layersVisible() ? buildStackLayout(this.pipeline.steps(), this.focusedLayer()) : undefined,
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const view = new TerrainView(this.canvasRef().nativeElement, {
        onLabelsChanged: (labels) => this.labels.set(labels),
        onRendered: () => this.positionLabels(),
      });
      destroyRef.onDestroy(() => view.dispose());
      this.view.set(view);
    });

    effect(() => this.view()?.showTerrain(this.pipeline.result()));
    effect(() => this.view()?.showStack(this.stackLayout()));
  }

  protected toggleLayers() {
    this.layersVisible.set(!this.layersVisible());
    this.focusedLayer.set(undefined);
  }

  protected toggleFocus(id: string) {
    this.focusedLayer.set(this.focusedLayer() === id ? undefined : id);
  }

  private positionLabels() {
    const view = this.view();
    for (const { nativeElement: label } of this.labelRefs()) {
      const placement = view?.getLabelPlacement(label.dataset['id'] ?? '');
      if (placement) {
        label.style.transform = `translate(${placement.x + LABEL_GAP}px, ${placement.y}px) translateY(-50%)`;
        label.style.visibility = placement.visible ? 'visible' : 'hidden';
      }
    }
  }
}

import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  resource,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { LucideImages, LucideListChevronsDownUp, LucideListChevronsUpDown, LucideLoaderCircle, LucideX } from '@lucide/angular';
import { RenderService } from '../../services/render.service';
import { ThumbnailCapture } from '../../services/library.service';
import { ExportMenu } from '../export-menu/export-menu.component';
import { LibraryStrip } from '../library-strip/library-strip.component';
import { StackLabel } from './scene/layerStack';
import { TerrainView } from './scene/terrainView';
import { buildStackLayout, FocusedLayers } from './stackLayout';

const LABEL_GAP = 16;
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 200;

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  host: {
    class: 'relative block size-full',
  },
  imports: [
    ExportMenu,
    LibraryStrip,
    LucideImages,
    LucideListChevronsUpDown,
    LucideListChevronsDownUp,
    LucideLoaderCircle,
    LucideX,
  ],
})
export class Canvas {
  private canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvasRef');
  private labelRefs = viewChildren<ElementRef<HTMLElement>>('layerLabel');
  private renderer = inject(RenderService);
  private view = signal<TerrainView | undefined>(undefined);

  protected layersVisible = signal(false);
  protected libraryVisible = signal(false);
  protected focusedLayer = signal<string | undefined>(undefined);
  protected labels = signal<StackLabel[]>([]);

  private steps = computed(() => this.renderer.rendered()?.steps ?? []);
  private complete = computed(() => this.renderer.rendered()?.complete ?? false);

  private focusedStep = computed(() => {
    const steps = this.complete() ? this.steps() : [];
    const index = steps.findIndex((step) => step.spec.id === this.focusedLayer());
    return index < 0 ? undefined : { step: steps[index], input: steps[index - 1]?.result };
  });

  protected focusedLayers = resource({
    params: () => this.focusedStep(),
    loader: async ({ params: { step, input }, abortSignal }): Promise<FocusedLayers> => ({
      id: step.spec.id,
      layers: await this.renderer.layersFor(step, input, abortSignal),
    }),
  });

  private stackLayout = computed(() =>
    this.layersVisible()
      ? buildStackLayout(
        this.steps(),
        this.focusedLayer(),
        this.focusedLayers.hasValue() ? this.focusedLayers.value() : undefined,
        this.complete(),
      )
      : undefined,
  );

  protected readonly captureThumbnail: ThumbnailCapture = () => {
    const view = this.view();
    const result = this.steps().at(-1)?.result;
    if (!view || !result) {
      return undefined;
    }
    view.showTerrain(result);
    return view.captureThumbnail(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  };

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

    effect(() => {
      const result = this.steps().at(-1)?.result;
      if (result) {
        this.view()?.showTerrain(result);
      }
    });
    effect(() => this.view()?.showStack(this.stackLayout()));
  }

  protected toggleLayers() {
    this.layersVisible.set(!this.layersVisible());
    this.focusedLayer.set(undefined);
  }

  protected toggleLibrary() {
    this.libraryVisible.set(!this.libraryVisible());
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

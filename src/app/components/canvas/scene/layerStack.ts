import * as THREE from 'three';
import { StackEntry, StackLayout } from '../stackLayout';
import { LayerPlane } from './layerPlane';
import { LayerTextures } from './layerTextures';
import { StackItem } from './stackItem';
import { TERRAIN_SIZE, TerrainBlock } from './terrainBlock';

const LAYER_OFFSET = 0.01;
const LAYER_SPACING = 0.5;

export interface StackLabel { id: string; label: string; focusable: boolean }

export interface LabelAnchor {
  height: number;
  visible: boolean;
}

const TERRAIN_LABEL: StackLabel = { id: 'terrain', label: 'Terrain', focusable: false };

export class LayerStack {
  readonly object = new THREE.Group();
  private readonly planes = new Map<string, LayerPlane>();
  private readonly geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE).rotateX(
    -Math.PI / 2,
  );
  private readonly terrain: StackItem;
  private height = 0;
  private terrainLabelled = false;

  constructor(
    private readonly terrainBlock: TerrainBlock,
    private readonly textures: LayerTextures,
    private readonly labelsChanged: (labels: StackLabel[]) => void,
  ) {
    this.terrain = new StackItem(terrainBlock.object, 0, true);
    this.object.add(terrainBlock.object);
  }

  get center() {
    return this.height / 2;
  }

  apply(layout?: StackLayout) {
    this.height = (layout?.planes.length ?? 0) * LAYER_SPACING;
    const targets = this.placePlanes(layout);
    this.moveOutPlane(layout, targets);
    this.placeTerrain(layout);
    this.publishLabels();
  }

  step(delta: number) {
    let animating = this.terrain.step(delta);
    for (const plane of this.planes.values()) {
      animating = plane.step(delta) || animating;
    }
    this.removeHiddenPlanes();
    return animating;
  }

  labelAnchor(id: string): LabelAnchor | undefined {
    if (id === TERRAIN_LABEL.id) {
      return {
        height: this.terrain.y.value + this.terrainBlock.height / 2,
        visible: this.terrainLabelled && this.terrain.isVisible,
      };
    }
    const plane = this.planes.get(id);
    return plane && { height: plane.y.value, visible: plane.isVisible };
  }

  dispose() {
    for (const plane of this.planes.values()) {
      plane.dispose();
    }
    this.planes.clear();
    this.geometry.dispose();
  }

  private placePlanes(layout?: StackLayout) {
    const origin = this.originOf(layout);
    const targets = new Map<string, number>();
    layout?.planes.forEach((entry, index) => {
      const y = LAYER_OFFSET + index * LAYER_SPACING;
      const plane = this.planes.get(entry.id) ?? this.addPlane(entry, origin);
      plane.update(entry);
      plane.moveTo(y, true);
      targets.set(entry.id, y);
    });
    return targets;
  }

  private moveOutPlane(layout: StackLayout | undefined, targets: Map<string, number>) {
    for (const plane of this.planes.values()) {
      if (!targets.has(plane.entry.id)) {
        plane.moveTo(layout ? this.exitHeight(plane, targets) : LAYER_OFFSET, false);
      }
    }
  }

  private placeTerrain(layout?: StackLayout) {
    const focused = layout?.focus !== undefined;
    this.terrainLabelled = layout !== undefined && !focused;
    this.terrain.moveTo(focused ? this.terrain.y.target : this.height, !focused);
  }

  private originOf(layout?: StackLayout) {
    const focusedPlane = layout?.focus ? this.planes.get(layout.focus) : undefined;
    return focusedPlane?.y.value ?? LAYER_OFFSET;
  }

  private exitHeight(plane: LayerPlane, targets: Map<string, number>) {
    const { parent } = plane.entry;
    const parentHeight = parent ? targets.get(parent) : undefined;
    return parentHeight ?? plane.y.target;
  }

  private addPlane(entry: StackEntry, y: number) {
    const plane = new LayerPlane(entry, this.geometry, this.textures, y);
    this.planes.set(entry.id, plane);
    this.object.add(plane.object);
    return plane;
  }

  private removeHiddenPlanes() {
    const hiddenPlanes = [...this.planes.values()].filter((plane) => plane.isHidden);
    for (const plane of hiddenPlanes) {
      this.object.remove(plane.object);
      plane.dispose();
      this.planes.delete(plane.entry.id);
    }
    if (hiddenPlanes.length > 0) {
      this.publishLabels();
    }
  }

  private publishLabels() {
    const planeLabels = [...this.planes.values()].map(({ entry: { id, label, focusable } }) => ({
      id,
      label,
      focusable,
    }));
    this.labelsChanged([...planeLabels, TERRAIN_LABEL]);
  }
}

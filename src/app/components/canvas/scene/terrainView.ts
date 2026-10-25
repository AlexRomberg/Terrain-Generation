import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LayerImage } from '../../../models/layerImage';
import { StackLayout } from '../stackLayout';
import { DampedValue } from './dampedValue';
import { LayerStack, StackLabel } from './layerStack';
import { LayerTextures } from './layerTextures';
import { Stage } from './stage';
import { TERRAIN_SIZE, TerrainBlock } from './terrainBlock';
import { Theme, watchColorScheme } from './theme';

const MAX_FRAME_TIME = 0.1;
const FOOTPRINT_CORNERS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
].map(([x, z]) => new THREE.Vector2(x, z).multiplyScalar(TERRAIN_SIZE / 2));

export interface TerrainViewEvents {
  onLabelsChanged: (labels: StackLabel[]) => void;
  onRendered: () => void;
}

export interface LabelPlacement {
  x: number;
  y: number;
  visible: boolean;
}

export class TerrainView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly camera = createCamera();
  private readonly scene = new THREE.Scene();
  private readonly background = new THREE.Color();
  private readonly fog = new THREE.Fog(this.background, 10, 25);
  private readonly stage = new Stage();
  private readonly terrainBlock = new TerrainBlock();
  private readonly stack: LayerStack;
  private readonly cameraLift = new DampedValue(0);
  private readonly projection = new THREE.Vector3();
  private readonly disposers: (() => void)[] = [];
  private needsRender = true;
  private previousTime = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: TerrainViewEvents,
  ) {
    this.renderer = createRenderer(canvas);
    this.controls = this.createControls();
    this.stack = new LayerStack(
      this.terrainBlock,
      new LayerTextures(this.renderer.capabilities.getMaxAnisotropy()),
      events.onLabelsChanged,
    );
    this.scene.background = this.background;
    this.scene.fog = this.fog;
    this.scene.add(this.stage.object, this.stack.object);
    this.disposers.push(
      watchColorScheme((theme) => this.applyTheme(theme)),
      this.observeResize(),
    );
    this.renderer.setAnimationLoop((time) => this.renderFrame(time));
  }

  showTerrain(image: LayerImage) {
    this.terrainBlock.setImage(image);
    this.needsRender = true;
  }

  showStack(layout?: StackLayout) {
    this.stack.apply(layout);
    this.cameraLift.target = this.stack.center;
  }

  getLabelPlacement(id: string): LabelPlacement | undefined {
    const anchor = this.stack.labelAnchor(id);
    if (!anchor) {
      return undefined;
    }
    const right = Math.max(
      ...FOOTPRINT_CORNERS.map((corner) => this.toScreen(corner.x, anchor.height, corner.y).x),
    );
    const { y } = this.toScreen(0, anchor.height, 0);
    return { x: right, y, visible: anchor.visible };
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.disposers.forEach((dispose) => dispose());
    this.stack.dispose();
    this.terrainBlock.dispose();
    this.stage.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }

  private renderFrame(time: number) {
    const delta = Math.min((time - this.previousTime) / 1000, MAX_FRAME_TIME);
    this.previousTime = time;
    const animating = this.animate(delta);
    if (this.controls.update() || this.needsRender || animating) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
      this.events.onRendered();
    }
  }

  private animate(delta: number) {
    const stackAnimating = this.stack.step(delta);
    const cameraAnimating = this.liftCamera(delta);
    return stackAnimating || cameraAnimating;
  }

  private liftCamera(delta: number) {
    const previousLift = this.cameraLift.value;
    if (!this.cameraLift.step(delta)) {
      return false;
    }
    const shift = this.cameraLift.value - previousLift;
    this.camera.position.y += shift;
    this.controls.target.y += shift;
    return true;
  }

  private applyTheme(theme: Theme) {
    this.background.set(theme.background);
    this.fog.color.set(theme.background);
    this.stage.applyTheme(theme);
    this.terrainBlock.applyTheme(theme);
    this.needsRender = true;
  }

  private observeResize() {
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(this.canvas);
    return () => observer.disconnect();
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  private createControls() {
    const controls = new OrbitControls(this.camera, this.canvas);
    controls.enableDamping = true;
    controls.minDistance = 1;
    controls.maxDistance = 10;
    controls.maxPolarAngle = Math.PI / 2 - 0.01;
    controls.addEventListener('change', () => {
      this.needsRender = true;
    });
    return controls;
  }

  private toScreen(x: number, y: number, z: number) {
    const point = this.projection.set(x, y, z).project(this.camera);
    return {
      x: ((point.x + 1) / 2) * this.canvas.clientWidth,
      y: ((1 - point.y) / 2) * this.canvas.clientHeight,
    };
  }
}

function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  return renderer;
}

function createCamera() {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(3, 3, 3);
  return camera;
}

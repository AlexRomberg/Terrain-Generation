import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LayerState } from '../../services/layer-state.service';
import { DEPTH, WIDTH } from '../../models/baseLayer';
import { LayerImage } from '../../models/layerImage';
import { Mesh } from 'three';

const COLOR = {
  STONE: {
    200: 0xf5f5f4,
    400: 0xa6a09b,
    700: 0x44403b,
    800: 0x292524,
    900: 0x1c1917,
    950: 0x171514,
  },
}

const THEME = {
  light: {
    background: COLOR.STONE[200],
    grid: COLOR.STONE[400],
    shadow: COLOR.STONE[800],
    shadowOpacity: 0.3,
  },
  dark: {
    background: COLOR.STONE[900],
    grid: COLOR.STONE[700],
    shadow: 0x000000,
    shadowOpacity: 0.5,
  },
};

const CUBE_HEIGHT = 0.2;
const CUBE_SIZE = 2.2;
const TERRAIN_WIDTH = WIDTH - 1;
const TERRAIN_DEPTH = DEPTH - 1;
const TERRAIN_SIZE = 2;
const TERRAIN_HEIGHT = 0.1;

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  host: {
    class: 'relative block size-full',
  },
})
export class Canvas {
  private canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvasRef');
  private destroyRef = inject(DestroyRef);
  private state = inject(LayerState);

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private disposeObjects: (() => void)[] = [];
  private terrain!: Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial, THREE.Object3DEventMap>;
  private walls!: Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial, THREE.Object3DEventMap>;
  private wallPerimeter = this.buildPerimeter();
  private wallPositions = new THREE.Float32BufferAttribute(new Float32Array((this.wallPerimeter.length - 1) * 18), 3);
  private appliedImage?: LayerImage;

  private baseLayerResult = computed(() =>
    this.state.selectedBaseLayer().renderResult(this.state.seed()).asZeroElevation()
  );

  private filteredResult = computed(() => {
    const seed = this.state.seed();
    let result = this.baseLayerResult();
    for (const filter of this.state.filterLayers) {
      if (filter.enabled()) {
        result = filter.layer.renderResult(result, seed);
      }
    }
    return result;
  });

  constructor() {
    afterNextRender(() => this.initScene(this.canvasRef().nativeElement));
  }

  private syncTerrain() {
    const image = this.filteredResult();
    if (image === this.appliedImage) {
      return;
    }
    this.appliedImage = image;
    this.applyBaseLayerTerrain(image);
    this.updateWalls();
  }

  private applyBaseLayerTerrain(image: LayerImage) {
    this.terrain.geometry.setFromPoints(new Array(image.elevation.length).fill(0).map((_, index) => {
      const x = (index % WIDTH) / TERRAIN_WIDTH * TERRAIN_SIZE - TERRAIN_SIZE / 2;
      const y = image.elevation[index] * TERRAIN_HEIGHT;
      const z = Math.floor(index / WIDTH) / TERRAIN_DEPTH * TERRAIN_SIZE - TERRAIN_SIZE / 2;
      return new THREE.Vector3(x, y, z);
    }));
    const positions = this.terrain.geometry.getAttribute('position');
    const colors = image.color ?? new Float32Array(positions.count * 3).fill(1);

    this.terrain.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.computeTerrainNormals();
  }

  private computeTerrainNormals() {
    const positions = this.terrain.geometry.getAttribute('position');
    const normals = this.terrain.geometry.getAttribute('normal');
    const heights = positions.array;
    const output = normals.array;
    const cellWidth = TERRAIN_SIZE / TERRAIN_WIDTH;
    const cellDepth = TERRAIN_SIZE / TERRAIN_DEPTH;

    for (let row = 0; row < DEPTH; row++) {
      const up = row > 0 ? row - 1 : row;
      const down = row < TERRAIN_DEPTH ? row + 1 : row;
      const spanZ = (down - up) * cellDepth;

      for (let col = 0; col < WIDTH; col++) {
        const left = col > 0 ? col - 1 : col;
        const right = col < TERRAIN_WIDTH ? col + 1 : col;
        const spanX = (right - left) * cellWidth;

        const slopeX = (heights[(row * WIDTH + right) * 3 + 1] - heights[(row * WIDTH + left) * 3 + 1]) / spanX;
        const slopeZ = (heights[(down * WIDTH + col) * 3 + 1] - heights[(up * WIDTH + col) * 3 + 1]) / spanZ;
        const inverseLength = 1 / Math.sqrt(slopeX * slopeX + 1 + slopeZ * slopeZ);

        const index = (row * WIDTH + col) * 3;
        output[index] = -slopeX * inverseLength;
        output[index + 1] = inverseLength;
        output[index + 2] = -slopeZ * inverseLength;
      }
    }

    normals.needsUpdate = true;
  }

  private updateWalls() {
    const positions = this.terrain.geometry.getAttribute('position');
    const offsetY = this.terrain.position.y;
    const baseY = 0;
    const perimeter = this.wallPerimeter;
    const vertices = this.wallPositions.array;

    for (let i = 0; i < perimeter.length - 1; i++) {
      const from = perimeter[i];
      const to = perimeter[i + 1];
      const fromX = positions.getX(from), fromY = positions.getY(from) + offsetY, fromZ = positions.getZ(from);
      const toX = positions.getX(to), toY = positions.getY(to) + offsetY, toZ = positions.getZ(to);
      vertices.set([
        fromX, fromY, fromZ, toX, toY, toZ, fromX, baseY, fromZ,
        toX, toY, toZ, toX, baseY, toZ, fromX, baseY, fromZ,
      ], i * 18);
    }

    this.wallPositions.needsUpdate = true;
    this.walls.geometry.computeVertexNormals();
  }

  private buildPerimeter() {
    const perimeter: number[] = [];
    for (let x = 0; x < TERRAIN_WIDTH; x++) {
      perimeter.push(x);
    }
    for (let z = 0; z < TERRAIN_DEPTH; z++) {
      perimeter.push(z * WIDTH + TERRAIN_WIDTH);
    }
    for (let x = TERRAIN_WIDTH; x > 0; x--) {
      perimeter.push(TERRAIN_DEPTH * WIDTH + x);
    }
    for (let z = TERRAIN_DEPTH; z > 0; z--) {
      perimeter.push(z * WIDTH);
    }
    perimeter.push(perimeter[0]);
    return perimeter;
  }

  private initScene(canvas: HTMLCanvasElement) {
    this.setupRenderer(canvas);
    this.setupScene();
    this.setupCamera();
    this.setupControls(canvas);

    const resize = this.initializeResizeObserver(canvas);
    this.startRenderLoop();

    this.destroyRef.onDestroy(() => {
      resize.disconnect();
      this.renderer.setAnimationLoop(null);
      for (const dispose of this.disposeObjects) {
        dispose();
      }
      this.renderer.dispose();
    });
  }

  private setupRenderer(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
  }

  private setupScene() {
    const background = new THREE.Color();
    const fog = new THREE.Fog(background, 10, 25);
    this.scene = new THREE.Scene();
    this.scene.background = background;
    this.scene.fog = fog;

    const grid = new THREE.GridHelper(50, 100, 0xffffff, 0xffffff);
    grid.position.y = -CUBE_HEIGHT - 0.001;
    this.scene.add(grid);
    this.disposeObjects.push(() => {
      grid.dispose();
    });

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.ShadowMaterial(),
    );
    floor.position.y = -CUBE_HEIGHT + 0.01;
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.disposeObjects.push(() => {
      floor.geometry.dispose();
      floor.material.dispose();
    });

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(CUBE_SIZE, CUBE_HEIGHT, CUBE_SIZE),
      new THREE.MeshStandardMaterial({ color: COLOR.STONE[950] }),
    );
    cube.position.y = CUBE_HEIGHT / 2 - CUBE_HEIGHT;
    cube.castShadow = true;
    cube.receiveShadow = true;
    this.scene.add(cube);
    this.disposeObjects.push(() => {
      cube.geometry.dispose();
      cube.material.dispose();
    });

    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(4, 7, -4);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.radius = 5;
    light.shadow.normalBias = 0.02;
    light.shadow.camera.left = -3;
    light.shadow.camera.bottom = -3;
    light.shadow.camera.right = 3;
    light.shadow.camera.top = 3;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 20;
    this.scene.add(light, new THREE.AmbientLight(0xffffff, 0.1));
    this.disposeObjects.push(() => {
      light.dispose();
    });

    this.terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_WIDTH, TERRAIN_DEPTH),
      new THREE.MeshLambertMaterial({ color: COLOR.STONE[200], vertexColors: true })
    );
    const colors = new Float32Array(WIDTH * DEPTH * 3).fill(1);
    this.terrain.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.terrain.geometry.rotateX(-Math.PI / 2);
    this.terrain.position.y = 0.03;
    this.terrain.castShadow = true;
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
    this.disposeObjects.push(() => {
      this.terrain.geometry.dispose();
      this.terrain.material.dispose();
    });

    this.walls = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshLambertMaterial({ color: COLOR.STONE[400] })
    );
    this.walls.geometry.rotateX(-Math.PI / 2);
    this.walls.geometry.setAttribute('position', this.wallPositions);
    this.walls.position.y = 0;
    this.walls.castShadow = true;
    this.walls.receiveShadow = true;
    this.scene.add(this.walls);
    this.disposeObjects.push(() => {
      this.walls.geometry.dispose();
      this.walls.material.dispose();
    });
    this.updateWalls();

    this.watchColorScheme((theme) => {
      background.set(theme.background);
      fog.color.set(theme.background);
      grid.material.color.set(theme.grid);
      floor.material.color.set(theme.shadow);
      floor.material.opacity = theme.shadowOpacity;
    });
  }

  private watchColorScheme(apply: (theme: typeof THEME.light) => void) {
    const darkModeWatcher = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => apply(darkModeWatcher.matches ? THEME.dark : THEME.light);
    update();
    darkModeWatcher.addEventListener('change', update);
    this.disposeObjects.push(() => {
      darkModeWatcher.removeEventListener('change', update);
    });
  }

  private setupCamera() {
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this.camera.position.set(3, 3, 3);
    this.camera.lookAt(0, 3, 0);
  }

  private setupControls(canvas: HTMLCanvasElement) {
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 10;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.01;
    this.disposeObjects.push(() => {
      this.controls.dispose();
    });
  }

  private initializeResizeObserver(canvas: HTMLCanvasElement) {
    const resize = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = canvas;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    });
    resize.observe(canvas);
    return resize;
  }

  private startRenderLoop() {
    this.renderer.setAnimationLoop(() => {
      this.syncTerrain();
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
}

import { afterNextRender, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private disposeObjects: (() => void)[] = [];

  constructor() {
    afterNextRender(() => this.initScene(this.canvasRef().nativeElement));
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
    grid.position.y = -0.001;
    this.scene.add(grid);
    this.disposeObjects.push(() => {
      grid.dispose();
    });

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.ShadowMaterial(),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.disposeObjects.push(() => {
      floor.geometry.dispose();
      floor.material.dispose();
    });

    const height = 0.2;
    const cubeSize = 2.2;
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(cubeSize, height, cubeSize),
      new THREE.MeshStandardMaterial({ color: COLOR.STONE[950] }),
    );
    cube.position.y = height / 2;
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
    this.camera.lookAt(0, 0, 0);
  }

  private setupControls(canvas: HTMLCanvasElement) {
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 3;
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
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
}

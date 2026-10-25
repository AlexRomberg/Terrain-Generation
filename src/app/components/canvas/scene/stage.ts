import * as THREE from 'three';
import { COLOR, Theme } from './theme';

const PEDESTAL_HEIGHT = 0.2;
const PEDESTAL_SIZE = 2.2;

export class Stage {
  readonly object = new THREE.Group();
  private readonly grid = createGrid();
  private readonly floor = createFloor();
  private readonly pedestal = createPedestalCube();
  private readonly light = createLight();

  constructor() {
    this.object.add(
      this.grid,
      this.floor,
      this.pedestal,
      this.light,
      new THREE.AmbientLight(0xffffff, 0.1),
    );
  }

  applyTheme(theme: Theme) {
    this.grid.material.color.set(theme.grid);
    this.floor.material.color.set(theme.shadow);
    this.floor.material.opacity = theme.shadowOpacity;
  }

  dispose() {
    this.grid.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.pedestal.geometry.dispose();
    this.pedestal.material.dispose();
    this.light.dispose();
  }
}

function createGrid() {
  const grid = new THREE.GridHelper(50, 100, 0xffffff, 0xffffff);
  grid.position.y = -PEDESTAL_HEIGHT - 0.001;
  return grid;
}

function createFloor() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial());
  floor.position.y = -PEDESTAL_HEIGHT + 0.01;
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  return floor;
}

function createPedestalCube() {
  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(PEDESTAL_SIZE, PEDESTAL_HEIGHT, PEDESTAL_SIZE),
    new THREE.MeshStandardMaterial({ color: COLOR.STONE[950] }),
  );
  pedestal.position.y = -PEDESTAL_HEIGHT / 2;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  return pedestal;
}

function createLight() {
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
  return light;
}

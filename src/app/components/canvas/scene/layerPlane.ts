import * as THREE from 'three';
import { StackEntry } from '../stackLayout';
import { LayerTextures } from './layerTextures';
import { StackItem } from './stackItem';

type LayerMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>;

export class LayerPlane extends StackItem<LayerMesh> {
  constructor(
    public entry: StackEntry,
    geometry: THREE.PlaneGeometry,
    private readonly textures: LayerTextures,
    y: number,
  ) {
    super(createMesh(geometry, textures.create(entry.image)), y, false);
  }

  update(entry: StackEntry) {
    if (entry.image !== this.entry.image) {
      this.object.material.map?.dispose();
      this.object.material.map = this.textures.create(entry.image);
    }
    this.entry = entry;
  }

  dispose() {
    this.object.material.map?.dispose();
    this.object.material.dispose();
  }
}

function createMesh(geometry: THREE.PlaneGeometry, texture: THREE.Texture): LayerMesh {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, map: texture }),
  );
  mesh.castShadow = true;
  return mesh;
}

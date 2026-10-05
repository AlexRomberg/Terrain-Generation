import { Component, signal } from '@angular/core';
import { Sidebar } from "./components/sidebar/sidebar.component";
import { Canvas } from "./components/canvas/canvas.component";
import { BaseLayer } from './models/baseLayer';
import { FilterLayer } from './models/filterLayer';
import { PerlinNoise } from './models/baseLayers/perlinNoise';
import { ColorFilter } from './models/filterLayers/colorFilter';

@Component({
  selector: 'app-root',
  styles: [],
  templateUrl: './app.component.html',
  imports: [Sidebar, Canvas],
})
export class App {
  protected availableBaseLayers: BaseLayer[] = [
    new PerlinNoise()
  ];
  protected selectedBaseLayers = signal<BaseLayer | null>(null);
  protected availableFilterLayers = signal<{ layer: FilterLayer, enabled: boolean }[]>([
    { layer: new ColorFilter(), enabled: false }
  ]);
  protected currentSeed = signal(Math.random());
}

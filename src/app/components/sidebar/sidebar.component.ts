import { Component, input, output } from '@angular/core';
import { ParameterCard } from '../parameter-card/parameter-card.component';
import { FormsModule } from '@angular/forms';
import { BaseLayer } from '../../models/baseLayer';
import { FilterLayer } from '../../models/filterLayer';

@Component({
  imports: [ParameterCard],
  selector: 'app-sidebar',
  styles: ``,
  templateUrl: './sidebar.component.html',
})
export class Sidebar {
  public availableBaseLayers = input.required<BaseLayer[]>();
  public selectedBaseLayers = input.required<BaseLayer | null>();
  public availableFilterLayers = input.required<{ layer: FilterLayer, enabled: boolean }[]>();
  public currentSeed = input.required<number>();

  public onBaseLayerChange = output<(layer: BaseLayer) => void>();
  public onFilterLayerChange = output<(layer: FilterLayer, enabled: boolean) => void>();
  public onSeedChange = output<(seed: number) => void>();
}

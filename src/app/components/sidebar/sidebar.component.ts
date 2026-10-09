import { Component, input, output } from '@angular/core';
import { ParameterCard } from '../parameter-card/parameter-card.component';
import { FormsModule } from '@angular/forms';
import { BaseLayer } from '../../models/baseLayer';
import { FilterLayer } from '../../models/filterLayer';
import { ToggleSwitch } from "../toggle-switch/toggle-switch.component";
import { LucideDice3, LucideLayers2, LucideLayers } from '@lucide/angular';

@Component({
  imports: [ParameterCard, FormsModule, ToggleSwitch, LucideDice3, LucideLayers2],
  selector: 'app-sidebar',
  styleUrl: './sidebar.component.css',
  templateUrl: './sidebar.component.html',
  host: {
    class: 'grid grid-rows-[auto_auto_1fr_auto] max-h-svh'
  }
})
export class Sidebar {
  public availableBaseLayers = input.required<BaseLayer[]>();
  public selectedBaseLayers = input.required<BaseLayer | null>();
  public availableFilterLayers = input.required<{ layer: FilterLayer, enabled: boolean }[]>();
  public currentSeed = input.required<number>();

  public onBaseLayerChange = output<BaseLayer>();
  public onFilterLayerChange = output<{ layer: FilterLayer, enabled: boolean }>();
  public onSeedChange = output<number>();
}

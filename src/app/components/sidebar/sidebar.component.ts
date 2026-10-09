import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideDice3, LucideLayers2 } from '@lucide/angular';
import { ParameterCard } from '../parameter-card/parameter-card.component';
import { ToggleSwitch } from '../toggle-switch/toggle-switch.component';
import { LayerState } from '../../services/layer-state.service';

@Component({
  imports: [FormsModule, ParameterCard, ToggleSwitch, LucideDice3, LucideLayers2],
  selector: 'app-sidebar',
  styleUrl: './sidebar.component.css',
  templateUrl: './sidebar.component.html',
  host: {
    class: 'grid grid-rows-[auto_auto_1fr_auto] max-h-svh'
  }
})
export class Sidebar {
  protected state = inject(LayerState);
}

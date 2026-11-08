import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideChevronRight,
  LucideDice3,
  LucideEye,
  LucideEyeOff,
  LucideGripVertical,
  LucideLayers2,
  LucidePlus,
  LucideTrash,
} from '@lucide/angular';
import { ParameterCard } from '../parameter-card/parameter-card.component';
import { FilterLayerState, LayerState } from '../../services/layer-state.service';

@Component({
  imports: [
    FormsModule,
    ParameterCard,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkScrollable,
    LucideDice3,
    LucideLayers2,
    LucideGripVertical,
    LucideChevronRight,
    LucideEye,
    LucideEyeOff,
    LucidePlus,
    LucideTrash
  ],
  selector: 'app-sidebar',
  styleUrl: './sidebar.component.css',
  templateUrl: './sidebar.component.html',
  host: {
    class: 'grid grid-rows-[auto_auto_1fr_auto] max-h-svh'
  }
})
export class Sidebar {
  protected state = inject(LayerState);
  protected selectedFilterType = signal(this.state.availableFilterLayers[0]);
  protected filterLayersTopDown = computed(() => [...this.state.filterLayers()].reverse());

  constructor() {
    effect(() => {
      console.table(this.state.filterLayers().map((layer) => ({ name: layer.layer.name, enabled: layer.enabled(), collapsed: layer.collapsed() })));
    });
  }

  protected setNewSeed() {
    this.state.seed.set(this.state.generateSeed());
  }

  protected dropFilterLayer(event: CdkDragDrop<unknown, unknown, FilterLayerState>) {
    this.state.moveFilterLayer(event.item.data.id, event.previousIndex - event.currentIndex);
  }
}

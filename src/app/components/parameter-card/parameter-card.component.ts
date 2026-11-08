import { Component, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EditableLayer } from '../../models/layerParameter';

@Component({
  imports: [FormsModule],
  selector: 'app-parameter-card',
  templateUrl: './parameter-card.component.html',
})
export class ParameterCard {
  layer = input.required<EditableLayer>();
  scope = input<string>();
  parameters = computed(() => Object.values(this.layer().parameters));
}

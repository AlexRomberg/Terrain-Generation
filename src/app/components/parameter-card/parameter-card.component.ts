import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LayerProvider } from '../../models/layerProvider';

@Component({
  imports: [FormsModule],
  selector: 'app-parameter-card',
  templateUrl: './parameter-card.component.html',
})
export class ParameterCard {
  layer = input.required<LayerProvider>();
}

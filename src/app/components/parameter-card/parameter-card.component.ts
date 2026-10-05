import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LayerProvider } from '../../models/layerProvider';

@Component({
  imports: [FormsModule],
  selector: 'app-parameter-card',
  styles: ``,
  templateUrl: './parameter-card.component.html',
})
export class ParameterCard {
  public layer = input.required<LayerProvider>();
}

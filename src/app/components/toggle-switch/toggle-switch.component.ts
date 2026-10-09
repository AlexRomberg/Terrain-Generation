import { Component, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  imports: [FormsModule],
  selector: 'app-toggle-switch',
  styleUrl: './toggle-switch.component.css',
  templateUrl: './toggle-switch.component.html',
})
export class ToggleSwitch {
  readonly value = model(false);
}

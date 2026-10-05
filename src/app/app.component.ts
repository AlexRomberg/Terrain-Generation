import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styles: [],
  templateUrl: './app.component.html',
})
export class App {
  protected readonly title = signal('UI');
}

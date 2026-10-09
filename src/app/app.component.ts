import { Component } from '@angular/core';
import { Sidebar } from './components/sidebar/sidebar.component';
import { Canvas } from './components/canvas/canvas.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  imports: [Sidebar, Canvas],
})
export class App {}

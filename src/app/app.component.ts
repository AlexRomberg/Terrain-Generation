import { Component, signal } from '@angular/core';
import { LucidePanelLeftClose, LucidePanelLeftOpen } from '@lucide/angular';
import { Sidebar } from './components/sidebar/sidebar.component';
import { Canvas } from './components/canvas/canvas.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  imports: [Sidebar, Canvas, LucidePanelLeftClose, LucidePanelLeftOpen],
})
export class App {
  protected readonly sidebarVisible = signal(true);
}

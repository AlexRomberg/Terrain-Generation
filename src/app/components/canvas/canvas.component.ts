import { Component, viewChild } from '@angular/core';

@Component({
  imports: [],
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
})
export class Canvas {
  canvasRef = viewChild.required<HTMLCanvasElement>('canvasRef');
}

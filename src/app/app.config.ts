import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { ExportService } from './services/export.service';

declare global {
  interface Window {
    layers: ExportService['layers'];
    exportImage: ExportService['exportImage'];
    exportAllLayers: ExportService['exportAllLayers'];
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAppInitializer(() => {
      const exporter = inject(ExportService);
      window.layers = () => exporter.layers();
      window.exportImage = (image, name) => exporter.exportImage(image, name);
      window.exportAllLayers = () => exporter.exportAllLayers();
    }),
  ],
};

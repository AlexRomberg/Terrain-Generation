import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideLoaderCircle, LucidePencil, LucidePlus, LucideTrash, LucideX } from '@lucide/angular';
import { Autofocus } from '../../directives/autofocus.directive';
import { LibraryEntry } from '../../services/library-store';
import { LibraryService, ThumbnailCapture } from '../../services/library.service';

@Component({
  selector: 'app-library-strip',
  imports: [FormsModule, Autofocus, LucideLoaderCircle, LucidePencil, LucidePlus, LucideTrash, LucideX],
  templateUrl: './library-strip.component.html',
  styleUrl: './library-strip.component.css',
  host: {
    class: 'flex flex-col items-start gap-1',
  },
})
export class LibraryStrip {
  readonly capture = input.required<ThumbnailCapture>();

  protected library = inject(LibraryService);
  protected saveFormOpen = signal(false);
  protected newName = signal('');
  protected renamingId = signal<string | undefined>(undefined);
  protected renameValue = signal('');

  protected openSaveForm() {
    this.newName.set(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
    this.saveFormOpen.set(true);
  }

  protected save() {
    const name = this.newName().trim() || 'Untitled';
    this.saveFormOpen.set(false);
    this.library.save(name, this.capture());
  }

  protected apply(entry: LibraryEntry) {
    this.library.apply(entry);
  }

  protected remove(entry: LibraryEntry) {
    if (confirm(`Delete "${entry.name}"?`)) {
      this.library.delete(entry);
    }
  }

  protected startRename(entry: LibraryEntry) {
    this.renameValue.set(entry.name);
    this.renamingId.set(entry.id);
  }

  protected commitRename(entry: LibraryEntry) {
    if (this.renamingId() !== entry.id) {
      return;
    }
    this.renamingId.set(undefined);
    const trimmed = this.renameValue().trim();
    if (trimmed && trimmed !== entry.name) {
      this.library.rename(entry, trimmed);
    }
  }
}

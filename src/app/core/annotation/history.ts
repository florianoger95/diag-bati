import { Shape } from './shapes';

const LIMIT = 100;

/** Annuler / rétablir par instantanés (les listes de formes sont légères). */
export class AnnotationHistory {
  private past: Shape[][] = [];
  private future: Shape[][] = [];

  constructor(private state: Shape[]) {}

  get current(): Shape[] {
    return this.state;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  apply(next: Shape[]): Shape[] {
    this.past.push(this.state);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
    this.state = next;
    return next;
  }

  undo(): Shape[] {
    const previous = this.past.pop();
    if (previous) {
      this.future.push(this.state);
      this.state = previous;
    }
    return this.state;
  }

  redo(): Shape[] {
    const next = this.future.pop();
    if (next) {
      this.past.push(this.state);
      this.state = next;
    }
    return this.state;
  }
}

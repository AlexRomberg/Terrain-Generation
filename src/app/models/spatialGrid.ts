export class SpatialGrid<T> {
  readonly bucketsPerSide: number;
  private readonly buckets: T[][];

  constructor(
    readonly worldSize: number,
    readonly bucketSize: number,
  ) {
    if (!(bucketSize > 0)) {
      throw new Error(`SpatialGrid bucket size must be positive, got ${bucketSize}`);
    }
    this.bucketsPerSide = Math.max(1, Math.ceil(worldSize / bucketSize));
    this.buckets = Array.from({ length: this.bucketsPerSide * this.bucketsPerSide }, () => []);
  }

  insert(x: number, y: number, item: T) {
    this.buckets[this.bucketIndex(this.bucketOf(x), this.bucketOf(y))].push(item);
  }

  forEachNear(x: number, y: number, radius: number, visit: (item: T) => void) {
    this.someNear(x, y, radius, (item) => {
      visit(item);
      return false;
    });
  }

  someNear(x: number, y: number, radius: number, predicate: (item: T) => boolean) {
    const fromX = this.bucketOf(x - radius);
    const toX = this.bucketOf(x + radius);
    const fromY = this.bucketOf(y - radius);
    const toY = this.bucketOf(y + radius);

    for (let bucketY = fromY; bucketY <= toY; bucketY++) {
      for (let bucketX = fromX; bucketX <= toX; bucketX++) {
        for (const item of this.buckets[this.bucketIndex(bucketX, bucketY)]) {
          if (predicate(item)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  queryNear(x: number, y: number, radius: number) {
    const items: T[] = [];
    this.forEachNear(x, y, radius, (item) => items.push(item));
    return items;
  }

  private bucketOf(coordinate: number) {
    const bucket = Math.floor(coordinate / this.bucketSize);
    return Math.min(Math.max(bucket, 0), this.bucketsPerSide - 1);
  }

  private bucketIndex(bucketX: number, bucketY: number) {
    return bucketX + bucketY * this.bucketsPerSide;
  }
}

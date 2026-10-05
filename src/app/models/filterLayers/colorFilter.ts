class ColorFilter implements FilterLayer {
  renderLayers(seed: number): LayerImage[] {
    throw new Error('Method not implemented.');
  }
  renderResult(seed: number): LayerImage {
    throw new Error('Method not implemented.');
  }
  name: string;
  parameters: LayerParameter[];

  constructor(name: string, parameters: LayerParameter[]) {
    this.name = name;
    this.parameters = parameters;
  }
}

interface FilterLayer extends LayerProvider {

  renderLayers(seed: number): LayerImage[];
  renderResult(seed: number): LayerImage;

}

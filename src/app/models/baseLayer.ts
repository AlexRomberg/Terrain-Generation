interface BaseLayer extends LayerProvider {

  renderLayers(seed: number): LayerImage[]
  renderResult(seed:number): LayerImage

}

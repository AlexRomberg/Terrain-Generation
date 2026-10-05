import { LayerParameter } from "./layerParameter";

export interface LayerProvider {
  name: string;
  parameters: LayerParameter[]
}

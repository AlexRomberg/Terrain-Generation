import { LayerParameter } from "./layerParameter";

export interface LayerProvider {
  name: string;
  parameters: Record<string, LayerParameter>;
}

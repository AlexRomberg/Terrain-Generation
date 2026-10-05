export interface LayerParameter {
  label: string;
  type: 'slider';

  set(value: number): void;
  value(): number;

}

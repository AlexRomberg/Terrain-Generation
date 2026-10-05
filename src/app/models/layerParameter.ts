export class LayerParameter {
  private _value: number = 0;
  constructor(public label: string, initialValue: number = 0) {
    this._value = initialValue;
  }

  set(value: number) {
    this._value = value;
  };

  value(): number {
    return this._value;
  }
}

export class SourceModelElement {
  modelId: string;
  elementId: string; 
  constructor(
    modelId: string,
    elementId: string
  ) {
    this.modelId = modelId;
    this.elementId = elementId;
  }
}
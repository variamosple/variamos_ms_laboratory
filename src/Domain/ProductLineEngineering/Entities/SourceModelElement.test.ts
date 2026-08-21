import { SourceModelElement } from "./SourceModelElement";

test("creates a source model element link", () => {
  expect(new SourceModelElement("model-1", "element-1")).toEqual({
    modelId: "model-1",
    elementId: "element-1",
  });
});
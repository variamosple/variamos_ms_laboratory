import { ModelEntity } from "./Model";

test("maps an ORM model into a domain model", () => {
  const ormModel = {
    id: "model-1",
    projectId: "project-1",
    productLineId: "product-line-1",
    engineeringType: "domain",
    name: "Domain model",
    type: "feature-model",
    languageId: 7,
    description: "Description",
    author: "Alice",
    source: "source",
    model: {
      elements: [{ id: "element-1" }],
      relationships: [{ id: "relationship-1" }],
      constraints: "constraint",
      sourceModelIds: ["source-model-1"],
    },
  } as any;

  expect(ModelEntity.fromOrm(ormModel)).toEqual({
    id: "model-1",
    projectId: "project-1",
    productLineId: "product-line-1",
    engineeringType: "domain",
    name: "Domain model",
    type: "feature-model",
    languageId: 7,
    description: "Description",
    author: "Alice",
    source: "source",
    inconsistent: false,
    consistencyError: undefined,
    elements: [{ id: "element-1" }],
    relationships: [{ id: "relationship-1" }],
    constraints: "constraint",
    sourceModelIds: ["source-model-1"],
  });
});
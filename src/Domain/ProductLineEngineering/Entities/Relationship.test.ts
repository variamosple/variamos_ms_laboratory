import { Point } from "./Point";
import { Property } from "./Property";
import { Relationship } from "./Relationship";

test("creates a relationship with points and properties", () => {
  const points = [new Point(1, 2)];
  const properties = [] as Property[];
  const relationship = new Relationship(
    "relationship-1",
    "contains",
    "association",
    "source-1",
    "target-1",
    points,
    1,
    2,
    properties
  );

  expect(relationship).toEqual({
    id: "relationship-1",
    name: "contains",
    type: "association",
    sourceId: "source-1",
    targetId: "target-1",
    points,
    min: 1,
    max: 2,
    properties,
  });
});
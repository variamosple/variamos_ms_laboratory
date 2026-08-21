import { Point } from "./Point";

test("creates a point", () => {
  expect(new Point(12, 24)).toEqual({ x: 12, y: 24 });
});
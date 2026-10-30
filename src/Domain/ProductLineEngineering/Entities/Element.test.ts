import { Element } from "./Element";
import { Property } from "./Property";

beforeEach(() => {
  jest.spyOn(global.Math, "random").mockReturnValue(0.123456789);
  jest.useFakeTimers();
  jest.setSystemTime(1655108206699);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("creates an element with geometry and optional instance id", () => {
  const properties = [] as Property[];
  const element = new Element("Feature", "feature", properties, "root", "type-1");

  expect(element).toMatchObject({
    id: "c71143d6-2921-4111-9111-111111111111",
    name: "Feature",
    type: "feature",
    parentId: "root",
    instanceOfId: "type-1",
    properties,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
});
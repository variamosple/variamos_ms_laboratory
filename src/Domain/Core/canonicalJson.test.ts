import { canonicalJson, modelHash } from "./canonicalJson";

describe("canonical JSON", () => {
  test("key order does not matter, array order does", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe('{"a":{"c":null,"d":[2,1]},"b":1}');
    expect(modelHash({ x: 1, y: 2 })).toBe(modelHash({ y: 2, x: 1 }));
    expect(modelHash([1, 2])).not.toBe(modelHash([2, 1]));
  });
});

import { differingPaths } from "./runComparison";

describe("differences between runs (LAB-RP-04)", () => {
  test("leaf paths whose value is not the same in every run, absent counts as different", () => {
    expect(
      differingPaths([
        { a: { x: 1, y: [1, 2] }, b: "same" },
        { a: { x: 2, y: [1, 2] }, b: "same", c: true },
      ])
    ).toEqual(["a/x", "c"]);
  });

  test("identical runs have no difference; arrays are compared whole", () => {
    expect(differingPaths([{ m: [1, 2] }, { m: [1, 2] }])).toEqual([]);
    expect(differingPaths([{ m: [1, 2] }, { m: [2, 1] }])).toEqual(["m"]);
  });
});

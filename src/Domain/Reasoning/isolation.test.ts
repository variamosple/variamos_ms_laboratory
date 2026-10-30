import fs from "fs";
import path from "path";

/**
 * LAB-R-02: the Laboratory reasons only through the public interface of the
 * Reasoning module (ReasoningGateway). It must not ship a solver library nor
 * start solver processes itself.
 */
const ROOT = path.resolve(__dirname, "../../..");
const SOLVER_PACKAGES = [
  "minizinc", "z3-solver", "z3", "swipl", "swipl-wasm", "clingo", "clingo-wasm",
  "glpk.js", "javascript-lp-solver", "logic-solver", "choco-solver",
];

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : [];
  });

test("no solver library among the dependencies", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

  expect(dependencies.filter((name) => SOLVER_PACKAGES.includes(name))).toEqual([]);
});

test("no source file starts processes or imports a solver", () => {
  const offending = sourceFiles(path.join(ROOT, "src")).filter((file) => {
    const source = fs.readFileSync(file, "utf8");
    return (
      /from ["'](node:)?child_process["']|require\(["'](node:)?child_process["']\)/.test(source) ||
      SOLVER_PACKAGES.some((name) => source.includes(`from "${name}"`))
    );
  });

  expect(offending.map((file) => path.relative(ROOT, file))).toEqual([]);
});

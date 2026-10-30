import { Router } from "express";
import { app } from "../app";
import experimentsRouter, { EXPERIMENTS_ROUTE } from "./experimentEntryPoints";
import metricsRouter, { METRICS_ROUTE } from "./MetricEntryPoints";
import catalogRouter, { CATALOG_ROUTE } from "./catalogEntryPoints";
import runsRouter, { RUNS_ROUTE } from "./runEntryPoints";
import commentsRouter, { COMMENTS_ROUTE } from "./commentEntryPoints";
import resultsRouter, { RESULTS_ROUTE } from "./resultsEntryPoints";
import { REPRODUCTIONS_ROUTE, RUNS_BY_REFERENCE_ROUTE, reproductionsRouter, runsByReferenceRouter } from "./reproducibilityEntryPoints";
import { checkContract, documentedOperations, openapi } from "../test-support/contract";

/** "get /experiments/{id}" for every route the service registers. */
const routesOf = (router: Router | any, prefix = ""): string[] =>
  router.stack
    .filter((layer: any) => layer.route)
    .flatMap((layer: any) =>
      Object.keys(layer.route.methods).map(
        (method) => `${method} ${(prefix + layer.route.path).replace(/\/$/, "").replace(/:(\w+)/g, "{$1}")}`
      )
    );

describe("openapi.json", () => {
  test("documents exactly the routes the service registers", () => {
    const registered = [
      ...routesOf((app as any)._router),
      ...routesOf(experimentsRouter, EXPERIMENTS_ROUTE),
      ...routesOf(metricsRouter, METRICS_ROUTE),
      ...routesOf(catalogRouter, CATALOG_ROUTE),
      ...routesOf(runsRouter, RUNS_ROUTE),
      ...routesOf(commentsRouter, COMMENTS_ROUTE),
      ...routesOf(resultsRouter, RESULTS_ROUTE),
      ...routesOf(runsByReferenceRouter, RUNS_BY_REFERENCE_ROUTE),
      ...routesOf(reproductionsRouter, REPRODUCTIONS_ROUTE),
    ].sort();

    expect(documentedOperations().sort()).toEqual(registered);
  });

  test("every operation documents its responses and every reference resolves", () => {
    for (const operation of documentedOperations()) {
      const [method, template] = operation.split(" ");
      const responses = openapi.paths[template][method].responses;
      expect(Object.keys(responses).length).toBeGreaterThan(0);

      for (const [status, response] of Object.entries<any>(responses)) {
        // Files (CSV, XLSX, ZIP) have no JSON schema to compile
        if (response.content?.["application/json"]) {
          // Compiles the schema: an unresolved $ref throws here
          expect(() => checkContract(method, template, Number(status), undefined)).toThrow(/does not match/);
        }
      }
    }
  });

  test("an undocumented route or status is reported", () => {
    expect(() => checkContract("GET", "/experiments/x/unknown", 200, {})).toThrow(/not documented/);
    expect(() => checkContract("GET", "/catalog/solvers", 418, {})).toThrow(/status 418/);
  });
});

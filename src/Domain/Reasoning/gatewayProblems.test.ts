import { gatewayProblems, ScenarioJobs } from "./gatewayProblems";
import { ReasoningJobRequest } from "./Entities/ReasoningJob";

const model = { modelId: "fm-1", languageId: 1, hash: "h1", snapshot: {}, semantics: {} };
const scenario = (overrides: Partial<ScenarioJobs> = {}): ScenarioJobs => ({
  label: "Car",
  solverConfigs: { z3: { version: "unpinned", timeOut: 5 }, minizinc: { version: "unpinned", mode: "optimization" } },
  operationalContext: { activeFeatures: ["GPS"] },
  models: [model],
  ...overrides,
});

describe("jobs a gateway cannot take (LAB-RUN-01)", () => {
  test("each solver of each scenario is checked as the run would send it, with the reason", () => {
    const received: ReasoningJobRequest[] = [];
    const gateway = {
      unsupported: (request: ReasoningJobRequest) => {
        received.push(request);
        return request.solver.parameters.mode === "optimization" ? 'the mode "optimization" is not offered.' : null;
      },
    };

    expect(gatewayProblems(gateway, [scenario()])).toEqual(['Car (minizinc): the mode "optimization" is not offered.']);
    // By solver id, as the provenance orders them; the version apart from the parameters
    expect(received.map((request) => request.solver)).toEqual([
      { id: "minizinc", version: "unpinned", parameters: { mode: "optimization" } },
      { id: "z3", version: "unpinned", parameters: { timeOut: 5 } },
    ]);
    expect(received[0].models).toEqual([model]);
    expect(received[0].operationalContext).toEqual({ activeFeatures: ["GPS"], inactiveFeatures: [], extraConstraints: "" });
  });

  test("no context is sent as null; a gateway without the check takes every job", () => {
    const received: ReasoningJobRequest[] = [];
    gatewayProblems({ unsupported: (request) => (received.push(request), null) }, [scenario({ operationalContext: null, solverConfigs: { z3: { version: "1" } } })]);
    expect(received[0].operationalContext).toBeNull();

    expect(gatewayProblems({}, [scenario()])).toEqual([]);
  });
});

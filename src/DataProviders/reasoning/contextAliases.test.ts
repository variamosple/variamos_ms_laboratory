import SemanticTranslatorReasoningGateway, { planOf, UnsupportedJobError } from "./SemanticTranslatorReasoningGateway";
import { ReasoningJobRequest } from "../../Domain/Reasoning/Entities/ReasoningJob";

const model = {
  id: "alias-model",
  elements: [
    { id: "gps", name: "GPS", properties: [{ name: "Selected", value: "Undefined" }] },
    { id: "radio", name: "Radio", properties: [{ name: "Selected", value: "Undefined" }] },
  ],
  relationships: [],
};

const requestOf = (activeFeatures: string[], inactiveFeatures: string[]): ReasoningJobRequest => ({
  solver: { id: "z3", version: "unpinned", parameters: { mode: "satisfiability", timeOut: 5 } },
  models: [{ modelId: model.id, languageId: 1, hash: "alias-hash", snapshot: model, semantics: {} }],
  operationalContext: { activeFeatures, inactiveFeatures, extraConstraints: "" },
});

describe("operational context resolves feature identity before applying selections", () => {
  test.each([
    ["gps", "Radio"],
    ["GPS", "radio"],
    ["gps", "radio"],
    ["GPS", "Radio"],
  ])("independent features: activate %s and deactivate %s", (active, inactive) => {
    const plan = planOf(requestOf([active], [inactive]));
    expect(plan.contextModel!.elements!.map(element => element.properties![0].value)).toEqual(["Selected", "Unselected"]);
    expect(model.elements.map(element => element.properties[0].value)).toEqual(["Undefined", "Undefined"]);
  });

  test.each([
    ["gps", "GPS"],
    ["GPS", "gps"],
  ])("reject contradictory aliases: active %s and inactive %s", (active, inactive) => {
    const request = requestOf([active], [inactive]);
    const gateway = new SemanticTranslatorReasoningGateway({ url: "http://127.0.0.1:9/query" });
    expect(gateway.unsupported(request)).not.toBeNull();
    expect(() => planOf(request)).toThrow(UnsupportedJobError);
    expect(gateway.activeJobs()).toBe(0);
  });
});

import MockReasoningGateway from "./MockReasoningGateway";
import { ReasoningJobRequest, TransientReasoningError } from "../../Domain/Reasoning/Entities/ReasoningJob";

const request: ReasoningJobRequest = {
  solver: { id: "z3", version: "4.13.0", parameters: { timeOut: 30 } },
  models: [{ modelId: "m1", languageId: 1, hash: "abc", snapshot: { elements: [{ name: "Car" }, { name: "GPS" }, { name: "Radio" }] }, semantics: {} }],
  operationalContext: { activeFeatures: ["GPS"], inactiveFeatures: [], extraConstraints: "" },
};

describe("mock Reasoning gateway", () => {
  test("a job is pending, then running, then completed with a simulated result", async () => {
    jest.useFakeTimers({ now: 0 });
    try {
      const gateway = new MockReasoningGateway({ durationMs: 1000 });
      const { jobId } = await gateway.submit(request);

      expect((await gateway.status(jobId)).state).toBe("PENDING");
      jest.setSystemTime(500);
      expect(await gateway.status(jobId)).toMatchObject({ state: "RUNNING", progress: 0.5 });
      jest.setSystemTime(1000);
      const done = await gateway.status(jobId);

      expect(done.state).toBe("COMPLETED");
      expect(done.result).toMatchObject({ simulated: true, features: 3, forcedActive: 1, configurations: 4, parameters: { timeOut: 30 }, modelHashes: ["abc"] });
      expect(gateway.activeJobs()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("cancelling releases the job", async () => {
    const gateway = new MockReasoningGateway({ durationMs: 10_000 });
    const { jobId } = await gateway.submit(request);
    await gateway.cancel(jobId);

    expect(gateway.activeJobs()).toBe(0);
    expect((await gateway.status(jobId)).state).toBe("FAILED");
  });

  test("simulated transient failures, then success", async () => {
    const gateway = new MockReasoningGateway({ transientFailures: 1 });

    await expect(gateway.submit(request)).rejects.toBeInstanceOf(TransientReasoningError);
    await expect(gateway.submit(request)).resolves.toHaveProperty("jobId");
    expect(gateway.received).toHaveLength(2);
  });
});

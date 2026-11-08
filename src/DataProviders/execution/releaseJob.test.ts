import { releaseJob } from "./RunExecutor";
import { getReasoningGateway, setReasoningGateway } from "../../Domain/Reasoning/ReasoningGateway";

describe("job cancellation deadline and resource cleanup (LAB-RUN-04)", () => {
  const originalGateway = getReasoningGateway();
  const cancel = jest.fn(async (_jobId: string): Promise<void> => undefined);
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    cancel.mockReset().mockResolvedValue(undefined);
    setReasoningGateway({
      name: "cancellation-test",
      listSolvers: jest.fn().mockResolvedValue([]),
      submit: jest.fn(),
      status: jest.fn(),
      cancel,
    });
    errorLog = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Cleanup follows the assertions: it must not hide an outstanding deadline.
    jest.clearAllTimers();
    jest.useRealTimers();
    setReasoningGateway(originalGateway);
    errorLog.mockRestore();
  });

  test("an immediately acknowledged cancellation leaves no deadline keeping the process alive", async () => {
    await releaseJob("job-1");

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("job-1");
    expect(errorLog).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a delayed acknowledgement clears the remaining deadline without a later warning", async () => {
    cancel.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 25)));
    const released = releaseJob("job-2");

    await jest.advanceTimersByTimeAsync(25);
    await released;

    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(3000);
    expect(errorLog).not.toHaveBeenCalled();
  });

  test("a rejected cancellation reports its error and leaves no deadline", async () => {
    const failure = new Error("Cancellation unavailable");
    cancel.mockRejectedValue(failure);

    await expect(releaseJob("job-3")).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("job-3"), failure);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a synchronous cancellation error also leaves no scheduled work", async () => {
    const failure = new Error("Gateway stopped before cancellation");
    cancel.mockImplementation(() => { throw failure; });

    await expect(releaseJob("job-4")).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("job-4"), failure);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("an unresponsive gateway still releases the caller at the three-second deadline", async () => {
    cancel.mockImplementation(() => new Promise<void>(() => undefined));
    let finished = false;
    const released = releaseJob("job-5").then(() => { finished = true; });

    await jest.advanceTimersByTimeAsync(2999);
    expect(finished).toBe(false);
    expect(errorLog).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await released;

    expect(finished).toBe(true);
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("job-5"), expect.objectContaining({ message: "no answer in 3000 ms" })
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a cancellation rejecting after the deadline is handled without a second warning", async () => {
    let rejectCancellation!: (reason: Error) => void;
    cancel.mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectCancellation = reject; }));
    const released = releaseJob("job-6");

    await jest.advanceTimersByTimeAsync(3000);
    await released;
    rejectCancellation(new Error("Late cancellation failure"));
    await jest.advanceTimersByTimeAsync(0);

    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});

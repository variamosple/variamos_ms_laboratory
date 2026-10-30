import RunRepository from "../../DataProviders/repository/Laboratory/RunRepository";
import { getRunExecutor, releaseJob } from "../../DataProviders/execution/RunExecutor";
import { RunView } from "./Entities/Run";
import { ExportFormat, benchmark, exportResults, metricsOf, resultRows } from "../Results/results";

/** P2: start, follow and cancel runs (LAB-RUN-01, LAB-RUN-03, LAB-RUN-04). */
export default class RunUseCase {
  private readonly runs = new RunRepository();

  async startRun(experimentId: string, userId: string): Promise<RunView> {
    const run = await this.runs.startRun(experimentId, userId);
    getRunExecutor().enqueue(run.id);
    return run;
  }

  async listRuns(experimentId: string, userId: string): Promise<RunView[]> {
    return this.runs.listRuns(experimentId, userId);
  }

  async getRun(experimentId: string, runId: string, userId: string): Promise<RunView> {
    return this.runs.getRun(experimentId, runId, userId);
  }

  async cancelRun(experimentId: string, runId: string, userId: string): Promise<RunView> {
    return this.runs.cancelRun(experimentId, runId, userId, (id) => getRunExecutor().cancel(id));
  }

  /** LAB-MT-04, LAB-VIS-02: metric values of the runs, one row per scenario run and metric. */
  async results(experimentId: string, userId: string, runIds: string[]) {
    const { runs } = await this.runs.resultsOf(experimentId, userId, runIds);
    return {
      metrics: metricsOf(runs),
      runs: runs.map(({ id, number, status, experimentVersion, startedAt, finishedAt }) => ({ id, number, status, experimentVersion, startedAt, finishedAt })),
      rows: resultRows(runs),
    };
  }

  /** LAB-MT-05 */
  async export(experimentId: string, userId: string, runIds: string[], format: ExportFormat) {
    const { experiment, runs } = await this.runs.resultsOf(experimentId, userId, runIds);
    return { experimentName: experiment.name, ...exportResults(experiment, runs, format) };
  }

  /** LAB-MT-06 */
  async benchmark(experimentId: string, userId: string, runIds: string[]) {
    const { runs } = await this.runs.resultsOf(experimentId, userId, runIds);
    return benchmark(runs);
  }

  /** LAB-RP-01 */
  async package(experimentId: string, runId: string, userId: string) {
    return this.runs.packageOf(experimentId, runId, userId);
  }

  /** LAB-RP-03 */
  async resolve(persistentId: string, userId: string) {
    return this.runs.resolve(persistentId, userId);
  }

  /** LAB-RP-04 */
  async compare(references: string[], userId: string) {
    return this.runs.compare(references, userId);
  }

  /** LAB-RP-01, LAB-NF-03 */
  async reproduce(file: Buffer, projectId: string, userId: string) {
    return this.runs.reproduce(file, projectId, userId);
  }

  /**
   * At start-up (RunExecutor keeps its queue in memory): the jobs the interrupted runs were waiting for
   * are stopped (LAB-RUN-04), then the runs are marked failed.
   */
  async failInterruptedRuns(): Promise<number> {
    for (const jobId of await this.runs.activeJobIds()) await releaseJob(jobId);
    return this.runs.failInterruptedRuns();
  }
}

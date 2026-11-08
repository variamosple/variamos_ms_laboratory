import http from "http";
import { AddressInfo } from "net";

/**
 * A local stand-in of the /query endpoint of variamosple/semantic_translator,
 * for contract tests: no real instance is ever called. The stub
 * checks a request the way old_request_handler/variamos/transform.py reads it,
 * and answers in the shapes of old_request_handler/request_handler.py:
 * sat -> a boolean; nsolve -> false, one project or a list of projects;
 * an iteration -> [variable, satisfiable] pairs; solver errors -> HTTP 200 with data.error.
 */
export const OPERATIONS = ["sat", "solve", "nsolve", "get_model", "get_code", "optimize"];
const TARGETS = ["minizinc", "swi", "z3"];

export type Body = { data: any };
export type Answer = { status?: number; json?: unknown; text?: string; delayMs?: number; hang?: boolean };

export interface Stub {
  url: string;
  received: Body[];
  /** Requests whose connection was closed before an answer. */
  aborted: number;
  close: () => Promise<void>;
}

/** The model the translator would reason on, found as transform.py finds it. */
export const selectedModel = (body: Body) => {
  const line = body.data.project.productLines[0];
  const models = [...line.domainEngineering.models, ...(line.applicationEngineering.applications[0]?.models ?? [])];
  return models.find((model: any) => model.id === body.data.modelSelectedId);
};

function contractProblem(body: Body): string | null {
  const data = body?.data;
  if (!data?.project?.productLines?.[0]?.domainEngineering?.models) return "no domain engineering models";
  if (!Array.isArray(data.project.productLines[0].applicationEngineering?.applications)) return "no applications list";
  if (!selectedModel(body)) return "StopIteration: modelSelectedId not in the project";
  if (data.rules === undefined) return "KeyError: rules";
  if (!OPERATIONS.includes(data.query?.operation)) return "invalid operation";
  if (!TARGETS.includes(data.query?.solver)) return "invalid solver";
  return null;
}

export async function startStub(answer: (body: Body) => Answer): Promise<Stub> {
  const received: Body[] = [];
  const stub = { aborted: 0 } as Stub;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw) as Body;
      received.push(body);
      const problem = req.method === "POST" && req.url === "/query" ? contractProblem(body) : "not POST /query";
      // Unexpected exceptions of the translator end as an HTML error page
      const reply = problem ? { status: 500, text: `<h1>Internal Server Error</h1>${problem}` } : answer(body);
      res.on("close", () => {
        if (!res.writableEnded) stub.aborted += 1;
      });
      if (reply.hang) return;
      setTimeout(() => {
        res.statusCode = reply.status ?? 200;
        res.setHeader("Content-Type", reply.text !== undefined ? "text/html" : "application/json");
        res.end(reply.text ?? JSON.stringify(reply.json));
      }, reply.delayMs ?? 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  stub.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/query`;
  stub.received = received;
  stub.close = () => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(() => resolve()));
  };
  return stub;
}

/** One project per solution, as request_handler.py builds them. */
export const projects = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `solution-${index}` }));
export const statistics = { total_time: 1000 };
export const ok = (content: unknown): Answer => ({ json: { data: { content }, statistics } });

/** A feature model where only the root is required: the iteration finds it alone unsatisfiable. */
export const iteration = (body: Body) =>
  selectedModel(body).elements.map((element: any) => [`UUID_${element.id}`, element.type !== "RootFeature"]);

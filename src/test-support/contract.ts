import fs from "fs";
import path from "path";
import Ajv2020, { ValidateFunction } from "ajv/dist/2020";

/**
 * Checks HTTP responses against openapi.json, so the documented contract and
 * the service cannot drift apart. Used by the integration tests.
 */
export const openapi = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../openapi.json"), "utf8")
);

const METHODS = ["get", "put", "post", "delete"] as const;

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const validators = new Map<string, ValidateFunction>();

const validatorFor = (key: string, schema: object) => {
  if (!validators.has(key)) {
    validators.set(key, ajv.compile({ ...schema, components: openapi.components }));
  }
  return validators.get(key)!;
};

/** "get /experiments/{id}/detailed" for every documented operation. */
export const documentedOperations = (): string[] =>
  Object.entries(openapi.paths).flatMap(([template, item]: [string, any]) =>
    METHODS.filter((method) => item[method]).map((method) => `${method} ${template}`)
  );

/** The documented path template for a concrete URL; literal segments win over parameters. */
const templateFor = (method: string, url: string): string | undefined =>
  Object.keys(openapi.paths)
    .filter((template) => openapi.paths[template][method])
    .filter((template) => new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(url))
    .sort((a, b) => (a.match(/\{/g)?.length ?? 0) - (b.match(/\{/g)?.length ?? 0))[0];

export function checkContract(method: string, url: string, status: number, body: unknown) {
  const lowerMethod = method.toLowerCase();
  const pathOnly = url.split("?")[0];
  const template = templateFor(lowerMethod, pathOnly);

  if (!template) {
    throw new Error(`Contract: ${method} ${pathOnly} is not documented in openapi.json`);
  }

  const response = openapi.paths[template][lowerMethod].responses[String(status)];
  if (!response) {
    throw new Error(`Contract: status ${status} of ${method} ${template} is not documented`);
  }

  const schema = response.content?.["application/json"]?.schema;
  if (!schema) return;

  const validate = validatorFor(`${lowerMethod} ${template} ${status}`, schema);
  if (!validate(body)) {
    throw new Error(
      `Contract: ${method} ${template} ${status} does not match openapi.json: ${ajv.errorsText(validate.errors)}`
    );
  }
}

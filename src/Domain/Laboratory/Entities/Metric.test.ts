import { Metric } from "./Metric";

test("creates a metric with all supplied values", () => {
  const createdAt = new Date("2026-01-01");
  const updatedAt = new Date("2026-01-02");
  const metric = new Metric(
    "metric-1",
    "Accuracy",
    "correct / total",
    "%",
    "return accuracy",
    createdAt,
    updatedAt,
    "Accuracy description",
    "user-1"
  );

  expect(metric).toEqual({
    id: "metric-1",
    name: "Accuracy",
    formula: "correct / total",
    unit: "%",
    script: "return accuracy",
    description: "Accuracy description",
    userId: "user-1",
    createdAt,
    updatedAt,
  });
});
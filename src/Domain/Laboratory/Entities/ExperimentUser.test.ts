import { ExperimentRoleEnum, ExperimentUser } from "./ExperimentUser";

test("creates an experiment user with the selected role", () => {
  const experimentUser = new ExperimentUser(
    "experiment-1",
    "user-1",
    ExperimentRoleEnum.EDITOR
  );

  expect(experimentUser).toEqual({
    experimentId: "experiment-1",
    userId: "user-1",
    role: ExperimentRoleEnum.EDITOR,
  });
});

test("exposes all supported experiment roles", () => {
  expect(Object.values(ExperimentRoleEnum)).toEqual([
    "owner",
    "director",
    "editor",
    "viewer",
  ]);
});
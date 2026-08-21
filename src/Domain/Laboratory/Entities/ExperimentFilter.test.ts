import { ExperimentFilter } from "./ExperimentFilter";

test("ExperimentFilter supports defaults and fluent builder", () => {
  expect(new ExperimentFilter()).toMatchObject({ pageNumber: 1, pageSize: 20 });

  const filter = ExperimentFilter.builder()
    .setUserId("user-1")
    .setName("trial")
    .setPageNumber(2)
    .setPageSize(10)
    .build();

  expect(filter).toEqual({
    userId: "user-1",
    name: "trial",
    pageNumber: 2,
    pageSize: 10,
  });
});
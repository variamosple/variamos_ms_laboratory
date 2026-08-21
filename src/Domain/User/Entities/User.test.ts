import { User } from "../../Session/Entities/User";

test("keeps the user identity fields", () => {
  expect(new User("user-1", "alice", "Alice", "alice@example.com")).toEqual({
    id: "user-1",
    user: "alice",
    name: "Alice",
    email: "alice@example.com",
  });
});
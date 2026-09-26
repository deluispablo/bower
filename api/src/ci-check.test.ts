import { describe, expect, it } from "vitest";

describe("ci check", () => {
  it("is trivially failing on purpose to verify CI goes red", () => {
    expect(1).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("workspace permissions", () => {
  it("owner는 멤버를 관리할 수 있다", () => expect(can("owner", "manage_members")).toBe(true));
  it("editor는 편집할 수 있지만 삭제할 수 없다", () => {
    expect(can("editor", "edit")).toBe(true);
    expect(can("editor", "delete")).toBe(false);
  });
  it("viewer는 읽기만 가능하다", () => {
    expect(can("viewer", "read")).toBe(true);
    expect(can("viewer", "edit")).toBe(false);
  });
});

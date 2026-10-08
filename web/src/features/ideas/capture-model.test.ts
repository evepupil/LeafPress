import { describe, expect, it } from "vitest"

import { defaultIdeaAccountId } from "./capture-model"

describe("灵感默认账号", () => {
  it("follows the most recently created account", () => {
    expect(
      defaultIdeaAccountId([
        { id: "older", createdAt: "2026-10-01T10:00:00+02:00" },
        { id: "newer", createdAt: "2026-10-01T09:00:00Z" },
      ]),
    ).toBe("newer")
  })

  it("returns no account when the account list is empty", () => {
    expect(defaultIdeaAccountId([])).toBeUndefined()
  })
})

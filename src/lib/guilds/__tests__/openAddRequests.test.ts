import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { guildMemberChangeRequest: { findFirst } },
}));
vi.mock("@/lib/email", () => ({ sendWelcomeEmail: vi.fn() }));

import {
  GuildInputError,
  assertNoOpenAddRequests,
} from "@/lib/guilds/accounts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertNoOpenAddRequests", () => {
  it("passes when no add request in review uses the email", async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      assertNoOpenAddRequests(["new@x.com"]),
    ).resolves.toBeUndefined();
  });

  it("looks only at open ADD requests for the given emails", async () => {
    findFirst.mockResolvedValue(null);
    await assertNoOpenAddRequests(["a@x.com", "b@x.com"]);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          action: "ADD",
          newEmail: { in: ["a@x.com", "b@x.com"] },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      }),
    );
  });

  it("names the email and guild when a request is still in review", async () => {
    findFirst.mockResolvedValue({
      newEmail: "jane@x.com",
      guild: { name: "Test Guild" },
    });
    const result = assertNoOpenAddRequests(["jane@x.com"]);
    await expect(result).rejects.toBeInstanceOf(GuildInputError);
    await expect(result).rejects.toThrow(
      "jane@x.com is in a request to join Test Guild that's still in review - reject that request in Guild Requests first",
    );
  });
});

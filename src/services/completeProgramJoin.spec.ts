import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Program } from "./programService";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invalidateCache: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("./offlineCache", () => ({
  cacheKeys: { program: (id: string) => `cache:program:${id}` },
  invalidateCache: mocks.invalidateCache,
}));
import { completeProgramJoin } from "./completeProgramJoin";

const user = { id: "confirmed-user", user_metadata: { pending_invite_code: " abcd1234 " } };
const empty = { value: null, offline: false, fromCache: false };
const member = { ...empty, value: { id: "team" } as Program };

describe("joining after email confirmation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.invalidateCache.mockResolvedValue(undefined);
  });

  it("redeems the account's saved code and reloads team access before returning", async () => {
    const read = vi.fn().mockResolvedValueOnce(empty).mockResolvedValueOnce(member);
    expect(await completeProgramJoin(user, read)).toEqual(member);
    expect(mocks.rpc).toHaveBeenCalledWith("redeem_invite_code", { submitted_code: "ABCD1234" });
    expect(mocks.invalidateCache).toHaveBeenCalledWith("cache:program:confirmed-user");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not redeem stale codes for existing members", async () => {
    expect(await completeProgramJoin(user, async () => member)).toEqual(member);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("preserves offline state instead of attempting to join", async () => {
    const offline = { ...empty, offline: true };
    expect(await completeProgramJoin(user, async () => offline)).toEqual(offline);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps normal setup available to accounts without a saved invite", async () => {
    expect(await completeProgramJoin({ id: "owner", user_metadata: {} }, async () => empty)).toEqual(empty);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("surfaces invalid codes and allows a later retry", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { message: "That invite code is not valid" } });
    await expect(completeProgramJoin(user, async () => empty)).rejects.toThrow("That invite code is not valid");
    const retry = vi.fn().mockResolvedValueOnce(empty).mockResolvedValueOnce(member);
    expect(await completeProgramJoin(user, retry)).toEqual(member);
  });

  it("shares redemption between simultaneous startup loads", async () => {
    const read = vi.fn().mockResolvedValueOnce(empty).mockResolvedValueOnce(empty).mockResolvedValue(member);
    const results = await Promise.all([completeProgramJoin(user, read), completeProgramJoin(user, read)]);
    expect(results).toEqual([member, member]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});

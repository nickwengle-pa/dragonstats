// @vitest-environment jsdom
/**
 * Open a recorded play in the real entry modal, change nothing, save it - and
 * get back exactly what went in.
 *
 * Editing runs through the entry modal: playEntrySeed.ts reads a play back
 * into the modal's state, and handleSubmit writes it out again. Whatever the
 * two disagree on is silently rewritten on every save, which is how an
 * unchanged edit put a fumble-return touchdown's carrier back on the line of
 * scrimmage and knocked a yard off every safety. This drives the actual
 * component through every step to Save, for every play type, both ways round,
 * all over the field.
 */
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import PlayEntryModal, { type PlaySubmitData } from "@/components/game/PlayEntryModal";
import { resolveEditedNextSituation } from "@/components/game/editNextSituation";
import { DEFAULT_GAME_CONFIG } from "@/services/programService";
import { findPlayTypeDef, type PlayRecord, type RosterPlayer, type OpponentPlayerRef, type TaggedPlayer } from "@/components/game/types";

beforeAll(() => {
  // jsdom gaps the modal touches
  (window as any).matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= function () {};
  (Element.prototype as any).scrollTo ??= function () {};
  window.confirm = () => true;
});
afterEach(() => cleanup());

const roster: RosterPlayer[] = ["qb", "rb", "wr", "k", "p", "kr", "lb", "cb", "dl"].map((id, i) => ({
  id, player_id: id, jersey_number: i + 1, position: null, positions: null,
  player: { id, first_name: id.toUpperCase(), last_name: "Us", preferred_name: null },
}));
const opp: OpponentPlayerRef[] = ["o_qb", "o_rb", "o_wr", "o_k", "o_p", "o_kr", "o_lb", "o_cb", "o_dl"].map((id, i) => ({
  id, name: id, jersey_number: 50 + i, position: null,
}));
const us = (id: string, role: string): TaggedPlayer => ({ id, player_id: id, jersey_number: 1, name: id, role });
const them = (id: string, role: string): TaggedPlayer => ({ id, player_id: id, jersey_number: 50, name: id, role, isOpponent: true });

function play(over: Partial<PlayRecord>): PlayRecord {
  return {
    id: "p", quarter: 1, clock: 600, type: "rush", yards: 0, result: "", penalty: null,
    flagYards: 0, isTouchdown: false, firstDown: false, turnover: false, tagged: [],
    ballOn: 30, down: 1, distance: 10, description: "", possession: "us",
    penaltyEnforcement: "accepted", penaltyCategory: null, playData: {},
    ...over,
  };
}

async function roundTrip(p: PlayRecord): Promise<{ out: PlaySubmitData | null; steps: string[] }> {
  let out: PlaySubmitData | null = null;
  const steps: string[] = [];
  const def = findPlayTypeDef(p.type);
  if (!def) throw new Error(`no play type ${p.type}`);
  render(
    <PlayEntryModal
      playType={def}
      editing={p}
      gameState={{ quarter: p.quarter, clock: p.clock, possession: p.possession, ourScore: 0, theirScore: 0, down: p.down, distance: p.distance, ballOn: p.ballOn }}
      roster={roster}
      opponentPlayers={opp}
      progName="Us" oppName="Them"
      trackFormations trackTacklers
      onSubmit={(d) => { out = d; }}
      onClose={() => {}}
      onDelete={() => {}}
    />,
  );
  for (let i = 0; i < 40 && !out; i++) {
    const save = screen.queryByRole("button", { name: /Save Changes/ });
    if (save) {
      if ((save as HTMLButtonElement).disabled) { steps.push("SAVE DISABLED"); break; }
      await act(async () => { fireEvent.click(save); });
      break;
    }
    const heading = document.querySelector(".text-xs.text-slate-400")?.textContent ?? "";
    steps.push(heading);
    const next = screen.queryAllByRole("button").find(b => /^\s*Next\s*$/.test(b.textContent ?? ""));
    if (!next) { steps.push("NO NEXT"); break; }
    if ((next as HTMLButtonElement).disabled) { steps.push("NEXT DISABLED"); break; }
    await act(async () => { fireEvent.click(next); });
  }
  return { out, steps };
}

/** The fields an unchanged edit must hand back unchanged. */
function diff(p: PlayRecord, o: PlaySubmitData) {
  const d: Record<string, [unknown, unknown]> = {};
  const cmp = (k: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) d[k] = [a, b]; };
  cmp("type", p.type, o.playType.id);
  cmp("yards", p.yards, o.yards);
  cmp("isTouchdown", p.isTouchdown, o.isTouchdown);
  cmp("firstDown", p.firstDown, o.isFirstDown);
  cmp("turnover", p.turnover, o.turnover ?? ["int", "fumble"].includes(o.playType.id));
  cmp("penalty", p.penalty, o.penalty);
  cmp("flagYards", p.penalty && (p.penaltyEnforcement ?? "accepted") === "accepted" ? p.flagYards : 0, o.flagYards);
  if (p.fumbleReturnYards != null || o.fumbleReturnYards != null) cmp("fumbleReturnYards", p.fumbleReturnYards ?? null, o.fumbleReturnYards ?? null);
  if (p.fumbleRecoveredAt != null || o.fumbleRecoveredAt != null) cmp("fumbleRecoveredAt", p.fumbleRecoveredAt ?? null, o.fumbleRecoveredAt ?? null);
  const pd = p.playData ?? {};
  const od = (o.playData ?? {}) as Record<string, unknown>;
  for (const k of ["kicked_to_yard", "return_to_ball_on", "kick_outcome", "interception_return_yards", "interception_net_yards", "foul_spot_ball_on"]) {
    if (k in pd) cmp(`pd.${k}`, pd[k], od[k]);
  }
  for (const k of ["interception_spot", "interception_return_to"]) {
    if (k in pd) cmp(`pd.${k}.ball_on`, (pd[k] as any)?.ball_on, (od[k] as any)?.ball_on);
  }
  if (p.nextBallOn != null && pd.next_situation_source && pd.next_situation_source !== "auto") {
    cmp("next.ballOn", p.nextBallOn, o.nextSituation?.ballOn ?? null);
    cmp("next.down", p.nextDown, o.nextSituation?.down ?? null);
    cmp("next.distance", p.nextDistance, o.nextSituation?.distance ?? null);
    cmp("next.possession", p.nextPossession, o.nextSituation?.possession ?? null);
  }
  return d;
}

const scenarios: Array<[string, PlayRecord]> = [];
const KICKS = ["kickoff", "punt", "fair_catch", "onside_kick"];
// What live entry writes: a first down whenever the gain reaches the line.
const add = (name: string, over: Partial<PlayRecord>) => scenarios.push([name, play({
  id: name,
  firstDown: !KICKS.includes(over.type ?? "rush") && (over.yards ?? 0) >= (over.distance ?? 10),
  ...over,
})]);

for (const possession of ["us", "them"] as const) {
  const O = possession === "us" ? us : them;
  const D = possession === "us" ? them : us;
  const t = possession === "us" ? "" : "o_";
  // Scrimmage runs, all over the field
  for (const [ballOn, yards] of [[30, 5], [30, -3], [45, 12], [60, 8], [75, 20], [98, 1], [2, -1], [50, 0], [49, 2], [51, -2], [10, 45], [35, 64]] as const) {
    add(`${possession} rush ${ballOn}+${yards}`, { possession, type: "rush", ballOn, yards, firstDown: yards >= 10, tagged: [O(`${t}rb`, "rusher"), D(`${possession === "us" ? "o_" : ""}lb`, "tackler")] });
  }
  add(`${possession} rush TD from 25`, { possession, type: "rush", ballOn: 75, yards: 25, isTouchdown: true, tagged: [O(`${t}rb`, "rusher")] });
  add(`${possession} rush TD from 99`, { possession, type: "rush", ballOn: 99, yards: 1, isTouchdown: true, tagged: [O(`${t}rb`, "rusher")] });
  add(`${possession} pass comp 30+15`, { possession, type: "pass_comp", ballOn: 30, yards: 15, firstDown: true, tagged: [O(`${t}qb`, "passer"), O(`${t}wr`, "receiver")] });
  add(`${possession} pass comp TD 40 yd`, { possession, type: "pass_comp", ballOn: 60, yards: 40, isTouchdown: true, tagged: [O(`${t}qb`, "passer"), O(`${t}wr`, "receiver")] });
  add(`${possession} pass inc`, { possession, type: "pass_inc", ballOn: 40, yards: 0, tagged: [O(`${t}qb`, "passer")] });
  add(`${possession} sack -7`, { possession, type: "sack", ballOn: 40, yards: -7, tagged: [O(`${t}qb`, "passer")] });
  add(`${possession} scramble +6`, { possession, type: "scramble", ballOn: 40, yards: 6, tagged: [O(`${t}qb`, "passer")] });
  add(`${possession} kneel -2`, { possession, type: "kneel", ballOn: 40, yards: -2, tagged: [O(`${t}qb`, "rusher")] });
  add(`${possession} bad snap -12`, { possession, type: "bad_snap", ballOn: 40, yards: -12 });
  add(`${possession} safety (tackled in EZ from the 3)`, { possession, type: "safety", ballOn: 3, yards: -3, tagged: [] });

  // Fumbles
  add(`${possession} fumble lost (type) at +4`, { possession, type: "fumble", ballOn: 40, yards: 4, turnover: true, fumbleReturnYards: 0, fumbleRecoveredAt: 44, tagged: [O(`${t}rb`, "rusher")] });
  add(`${possession} fumble lost returned 10`, { possession, type: "fumble", ballOn: 40, yards: 4, turnover: true, fumbleReturnYards: 10, fumbleRecoveredAt: 44, tagged: [O(`${t}rb`, "rusher")] });
  add(`${possession} rush + fumble lost, returned for TD`, { possession, type: "rush", ballOn: 40, yards: 6, turnover: true, isTouchdown: true, fumbleReturnYards: 46, fumbleRecoveredAt: 46, tagged: [O(`${t}rb`, "rusher"), D(`${possession === "us" ? "o_" : ""}lb`, "fumble_recovery")] });
  add(`${possession} rush + fumble kept`, { possession, type: "rush", ballOn: 40, yards: 6, turnover: false, fumbleReturnYards: 0, fumbleRecoveredAt: 46, tagged: [O(`${t}rb`, "rusher"), O(`${t}wr`, "fumble_recovery")] });
  add(`${possession} sack fumble lost`, { possession, type: "sack", ballOn: 40, yards: -8, turnover: true, fumbleReturnYards: 0, fumbleRecoveredAt: 32, tagged: [O(`${t}qb`, "passer"), D(`${possession === "us" ? "o_" : ""}dl`, "fumble_recovery")] });

  // Interceptions
  add(`${possession} INT returned 10`, {
    possession, type: "int", ballOn: 40, yards: 15, turnover: true,
    tagged: [O(`${t}qb`, "passer"), D(`${possession === "us" ? "o_" : ""}cb`, "interceptor")],
    playData: {
      interception_spot: { field_side: possession === "us" ? "opponent" : "program", yard_line: 35, ball_on: 65 },
      interception_return_to: { field_side: possession === "us" ? "opponent" : "program", yard_line: 45, ball_on: 55 },
      interception_return_yards: 10, interception_net_yards: 15,
    },
  });
  add(`${possession} INT returned for TD`, {
    possession, type: "int", ballOn: 40, yards: -40, turnover: true, isTouchdown: true,
    tagged: [O(`${t}qb`, "passer"), D(`${possession === "us" ? "o_" : ""}cb`, "interceptor")],
    playData: {
      interception_spot: { field_side: possession === "us" ? "opponent" : "program", yard_line: 35, ball_on: 65 },
      interception_return_to: { field_side: possession === "us" ? "program" : "opponent", yard_line: 0, ball_on: 0 },
      interception_return_yards: 65, interception_net_yards: -40,
    },
  });

  // Kicks (kicking team = possession)
  add(`${possession} kickoff returned`, {
    possession, type: "kickoff", ballOn: 40, yards: 40, tagged: [O(`${t}k`, "kicker"), D(`${possession === "us" ? "o_" : ""}kr`, "returner")],
    playData: { kick_outcome: "returned", kicked_to_yard: 5, return_to_ball_on: 80 },
  });
  add(`${possession} kickoff touchback`, {
    possession, type: "kickoff", ballOn: 40, yards: 60, isTouchback: true, tagged: [O(`${t}k`, "kicker")],
    playData: { kick_outcome: "touchback", kicked_to_yard: 0, return_to_ball_on: 80, is_touchback: true },
  });
  add(`${possession} punt returned`, {
    possession, type: "punt", ballOn: 30, yards: 30, tagged: [O(`${t}p`, "punter"), D(`${possession === "us" ? "o_" : ""}kr`, "returner")],
    playData: { kick_outcome: "returned", kicked_to_yard: 30, return_to_ball_on: 60 },
  });
  add(`${possession} punt fair catch`, {
    possession, type: "fair_catch", ballOn: 30, yards: 40, tagged: [O(`${t}p`, "punter"), D(`${possession === "us" ? "o_" : ""}kr`, "returner")],
    playData: { kick_outcome: "fair_catch", kicked_to_yard: 30, return_to_ball_on: 70 },
  });
  add(`${possession} short punt downed on kicking side`, {
    possession, type: "punt", ballOn: 10, yards: 30, tagged: [O(`${t}p`, "punter")],
    playData: { kick_outcome: "downed", kicked_to_yard: 60, return_to_ball_on: 40 },
  });
  // Older kick with no stored spots — read back from the description
  add(`${possession} legacy punt (desc only)`, {
    possession, type: "punt", ballOn: 30, yards: 32, description: "Punt #5 P 40 yds to UV 30, ret #6 KR 8 yds",
    tagged: [O(`${t}p`, "punter"), D(`${possession === "us" ? "o_" : ""}kr`, "returner")], playData: {},
  });

  add(`${possession} onside recovered by kicking team`, {
    possession, type: "onside_kick", ballOn: 40, yards: 12, tagged: [O(`${t}k`, "kicker"), O(`${t}kr`, "recoverer")],
    playData: { kick_outcome: "returned", kicked_to_yard: 48, return_to_ball_on: 52, onside_recovered_by_kicker: true },
  });
  add(`${possession} onside recovered by receiving team`, {
    possession, type: "onside_kick", ballOn: 40, yards: 12, tagged: [O(`${t}k`, "kicker"), D(`${possession === "us" ? "o_" : ""}kr`, "recoverer")],
    playData: { kick_outcome: "returned", kicked_to_yard: 48, return_to_ball_on: 52, onside_recovered_by_kicker: false },
  });
  add(`${possession} FG good`, { possession, type: "fg", ballOn: 75, yards: 0, result: "Good", tagged: [O(`${t}k`, "kicker")] });
  add(`${possession} PAT good`, { possession, type: "pat", ballOn: 97, yards: 0, result: "Good", tagged: [O(`${t}k`, "kicker")] });

  // Flags
  add(`${possession} rush + holding (off) accepted, spot foul`, {
    possession, type: "rush", ballOn: 40, yards: 12, firstDown: true, penalty: "Holding", penaltyCategory: "offense", flagYards: 10,
    tagged: [O(`${t}rb`, "rusher")],
    playData: { foul_spot_ball_on: 46, next_situation_source: "penalty_enforced" },
    nextBallOn: 36, nextDown: 1, nextDistance: 14, nextPossession: possession,
  });
  add(`${possession} rush + facemask (def) accepted 15`, {
    possession, type: "rush", ballOn: 40, yards: 5, penalty: "Face Mask", penaltyCategory: "defense", flagYards: 15,
    tagged: [O(`${t}rb`, "rusher")],
    playData: { foul_spot_ball_on: 45, next_situation_source: "penalty_enforced" },
    nextBallOn: 60, nextDown: 1, nextDistance: 10, nextPossession: possession,
  });
  add(`${possession} pass comp + holding declined`, {
    possession, type: "pass_comp", ballOn: 40, yards: 8, penalty: "Holding", penaltyCategory: "defense", penaltyEnforcement: "declined", flagYards: 0,
    tagged: [O(`${t}qb`, "passer"), O(`${t}wr`, "receiver")],
    playData: { penalty_enforcement: "declined" },
  });
  add(`${possession} legacy flag (no foul spot) rush + holding`, {
    possession, type: "rush", ballOn: 40, yards: 12, penalty: "Holding", penaltyCategory: "offense", flagYards: 10,
    tagged: [O(`${t}rb`, "rusher")], playData: {},
  });
  add(`${possession} false start`, { possession, type: "penalty_only", ballOn: 40, yards: 0, penalty: "False Start", penaltyCategory: "offense", flagYards: 5, playData: {} });
}

describe("edit round trip — unchanged edit must save back unchanged", () => {
  for (const [name, p] of scenarios) {
    it(name, async () => {
      const { out, steps } = await roundTrip(p);
      expect(out, `never reached save: ${steps.join(" > ")}`).not.toBeNull();
      expect(diff(p, out!)).toEqual({});
    });
  }
});

/* A spot typed into the Adjust sheet is stored as a manual override. The editor
   used to open every flag on the computed enforcement, so re-saving the play -
   to fix a tackler, say - wrote the computed spot back over the real one. */
describe("edit round trip — a hand-set next spot survives an unchanged edit", () => {
  const handSet = (over: Partial<PlayRecord>, next: { ballOn: number; down: number; distance: number; possession: "us" | "them" }) => play({
    ...over,
    playData: { ...(over.playData ?? {}), next_situation_source: "manual_override" },
    nextBallOn: next.ballOn, nextDown: next.down, nextDistance: next.distance, nextPossession: next.possession,
  });

  for (const possession of ["us", "them"] as const) {
    const O = possession === "us" ? us : them;
    const D = possession === "us" ? them : us;
    const t = possession === "us" ? "" : "o_";
    const other = possession === "us" ? "them" : "us";

    it(`${possession}: live-ball flag, officials spotted it off the arithmetic`, async () => {
      // Holding from the 46 would be the 36; the officials put it on the 33.
      const p = handSet({
        possession, type: "rush", ballOn: 40, yards: 12, penalty: "Holding", penaltyCategory: "offense", flagYards: 10,
        tagged: [O(`${t}rb`, "rusher")], playData: { foul_spot_ball_on: 46 },
      }, { ballOn: 33, down: 1, distance: 17, possession });
      const { out, steps } = await roundTrip(p);
      expect(out, steps.join(" > ")).not.toBeNull();
      expect(out!.nextSituation).toEqual({ ballOn: 33, down: 1, distance: 17, possession, source: "manual_override" });
      expect(out!.spotOverrideOffered).toBe(true);
    });

    it(`${possession}: dead-ball foul, hand-set spot`, async () => {
      const p = handSet({
        possession, type: "penalty_only", ballOn: 40, yards: 0, penalty: "False Start", penaltyCategory: "offense", flagYards: 5,
      }, { ballOn: 30, down: 1, distance: 20, possession });
      const { out, steps } = await roundTrip(p);
      expect(out, steps.join(" > ")).not.toBeNull();
      expect(out!.nextSituation).toEqual({ ballOn: 30, down: 1, distance: 20, possession, source: "manual_override" });
    });

    it(`${possession}: flag on an interception return, hand-set for the other team`, async () => {
      // Stored in the new team's frame, which the editor enters in the snap's.
      const p = handSet({
        possession, type: "int", ballOn: 40, yards: 15, turnover: true,
        penalty: "Holding", penaltyCategory: "defense", flagYards: 10,
        tagged: [O(`${t}qb`, "passer"), D(`${possession === "us" ? "o_" : ""}cb`, "interceptor")],
        playData: {
          interception_spot: { field_side: possession === "us" ? "opponent" : "program", yard_line: 35, ball_on: 65 },
          interception_return_to: { field_side: possession === "us" ? "opponent" : "program", yard_line: 45, ball_on: 55 },
          interception_return_yards: 10, interception_net_yards: 15, foul_spot_ball_on: 60,
        },
      }, { ballOn: 22, down: 1, distance: 10, possession: other });
      const { out, steps } = await roundTrip(p);
      expect(out, steps.join(" > ")).not.toBeNull();
      expect(out!.nextSituation).toEqual({ ballOn: 22, down: 1, distance: 10, possession: other, source: "manual_override" });
    });

    it(`${possession}: a "manual" spot that only confirmed the computed one stays computed`, async () => {
      // The Adjust sheet stores whatever it is confirmed with. Opening this as
      // an override would pin the ball, and fixing the flag yardage would no
      // longer move it.
      const p = handSet({
        possession, type: "rush", ballOn: 40, yards: 5, penalty: "Face Mask", penaltyCategory: "defense", flagYards: 15,
        tagged: [O(`${t}rb`, "rusher")], playData: { foul_spot_ball_on: 45 },
      }, { ballOn: 60, down: 1, distance: 10, possession });
      const { out, steps } = await roundTrip(p);
      expect(out, steps.join(" > ")).not.toBeNull();
      expect(out!.nextSituation).toEqual({ ballOn: 60, down: 1, distance: 10, possession, source: "penalty_enforced" });
    });

    it(`${possession}: interception with no flag hands the spot back to the saving screen`, async () => {
      const p = handSet({
        possession, type: "int", ballOn: 40, yards: 15, turnover: true,
        tagged: [O(`${t}qb`, "passer"), D(`${possession === "us" ? "o_" : ""}cb`, "interceptor")],
        playData: {
          interception_spot: { field_side: possession === "us" ? "opponent" : "program", yard_line: 35, ball_on: 65 },
          interception_return_to: { field_side: possession === "us" ? "opponent" : "program", yard_line: 45, ball_on: 55 },
          interception_return_yards: 10, interception_net_yards: 15,
        },
      }, { ballOn: 50, down: 1, distance: 10, possession: other });
      const { out, steps } = await roundTrip(p);
      expect(out, steps.join(" > ")).not.toBeNull();
      // Nothing in the editor could show it, so the editor says nothing...
      expect(out!.spotOverrideOffered).toBeFalsy();
      // ...and the save keeps it (editNextSituation.spec.ts covers the rules).
      expect(resolveEditedNextSituation(p, out!, DEFAULT_GAME_CONFIG).nextSituation)
        .toEqual({ ballOn: 50, down: 1, distance: 10, possession: other, source: "manual_override" });
    });
  }
});

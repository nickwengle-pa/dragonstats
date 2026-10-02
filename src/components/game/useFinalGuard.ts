/**
 * The game screen's side of a finished game's official final.
 *
 * Every path that changes plays on a finished game calls guard() with the
 * play list as it would be, BEFORE writing anything. guard() compares that
 * against the official copy, asks when the change needs confirming (see
 * needsConfirmation), and remembers the answer. The recalc that follows then
 * calls saveApproved(), which writes the new official copy - with the score,
 * keeping the game "completed" - only for a change that went through guard().
 *
 * A path that changes a finished game WITHOUT going through guard() leaves the
 * games row alone, so the change shows up as unconfirmed the next time the
 * game is opened instead of quietly becoming the final. That is the failure
 * the old code had: every recalc wrote the replayed score and status "live".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayRecord } from "@/components/game/types";
import type { LiveSessionConfig } from "@/services/liveGameSession";
import { isMarkedStatsFinal } from "@/services/gameCompletion";
import { saveGameFinal } from "@/services/gameService";
import {
  buildFinalRecord,
  checkFinal,
  diffFinalRecords,
  finalFields,
  needsConfirmation,
  readSnapshot,
  type FinalDiff,
  type FinalSource,
  type OpenCheck,
} from "@/services/finalRecord";
import type { TeamNames } from "./FinalChanges";

interface GameRow {
  status?: string | null;
  tags?: unknown;
  our_score?: number | null;
  opponent_score?: number | null;
  final_snapshot?: unknown;
  final_history?: unknown;
}

export function useFinalGuard({
  gameId,
  game,
  plays,
  config,
  names,
  ready,
  onGameChange,
}: {
  gameId: string | undefined;
  game: GameRow | null;
  plays: PlayRecord[];
  config: LiveSessionConfig | null;
  names: TeamNames;
  /** The game and its plays have finished loading. */
  ready: boolean;
  /** Merge what was written into the screen's copy of the games row. */
  onGameChange: (patch: Record<string, unknown>) => void;
}) {
  const isFinal = game?.status === "completed";
  const statsLocked = isFinal && isMarkedStatsFinal(game?.tags);
  const official = useMemo(() => readSnapshot(game?.final_snapshot), [game?.final_snapshot]);

  const [prompt, setPrompt] = useState<{ diff: FinalDiff; resolve: (ok: boolean) => void } | null>(null);
  const approval = useRef<{ diff: FinalDiff; confirmed: boolean } | null>(null);

  /** False means the change was declined: write nothing. */
  const guard = useCallback(async (nextPlays: PlayRecord[], nextConfig?: LiveSessionConfig): Promise<boolean> => {
    approval.current = null;
    if (!isFinal || !config) return true;
    const before = official ?? buildFinalRecord(plays, config);
    const after = buildFinalRecord(nextPlays, nextConfig ?? config);
    const diff = diffFinalRecords(before, after, names);
    const confirm = needsConfirmation(diff, statsLocked);
    if (confirm) {
      const ok = await new Promise<boolean>((resolve) => setPrompt({ diff, resolve }));
      setPrompt(null);
      if (!ok) return false;
    }
    approval.current = { diff, confirmed: confirm };
    return true;
  }, [isFinal, config, official, plays, names, statsLocked]);

  /**
   * After an approved change: the new official copy, the score it describes
   * and "completed", as one write. A change that never went through guard()
   * writes nothing here - see the file comment.
   */
  const saveApproved = useCallback(async (nextPlays: PlayRecord[], nextConfig?: LiveSessionConfig) => {
    const approved = approval.current;
    approval.current = null;
    if (!approved || !gameId || !game || !config) return;
    const record = buildFinalRecord(nextPlays, nextConfig ?? config);
    const source: FinalSource = approved.confirmed ? "change" : (official?.source ?? "change");
    const fields = finalFields(game, record, source, approved.diff, approved.confirmed);
    const patch = {
      ...fields,
      our_score: record.score.us,
      opponent_score: record.score.them,
      status: "completed" as const,
    };
    await saveGameFinal(gameId, patch);
    onGameChange(patch);
  }, [gameId, game, config, official, onGameChange]);

  /** The official copy for End Game; the caller merges it into that patch. */
  const finalizeFields = useCallback((finalPlays: PlayRecord[]) => {
    if (!game || !config) return null;
    const record = buildFinalRecord(finalPlays, config);
    return { record, fields: finalFields(game, record, "finalized", null, true) };
  }, [game, config]);

  /** Make what the plays say now the official final - the open-game banner. */
  const acceptCurrent = useCallback(async (diff: FinalDiff | null) => {
    if (!gameId || !game || !config) return;
    const record = buildFinalRecord(plays, config);
    const fields = finalFields(game, record, "accepted", diff, true);
    const patch = { ...fields, our_score: record.score.us, opponent_score: record.score.them, status: "completed" as const };
    await saveGameFinal(gameId, patch);
    onGameChange(patch);
  }, [gameId, game, config, plays, onGameChange]);

  /* ── Opening a finished game ──
     Compare what the plays say now with the official final. A finished game
     with no official copy yet - one that went final before copies existed -
     gets one taken now, but only while its plays still add up to the saved
     score: a copy of a game that has already drifted would make the drift
     official. */
  const [openCheck, setOpenCheck] = useState<OpenCheck | null>(null);
  const recordedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isFinal) { setOpenCheck(null); return; }
    if (!ready || !config || !game || !gameId || plays.length === 0 || prompt) return;

    const current = buildFinalRecord(plays, config);
    const saved = { us: Number(game.our_score ?? 0), them: Number(game.opponent_score ?? 0) };
    const check = checkFinal({ statsLocked, official, current, saved, names });
    if (check !== "record") { setOpenCheck(check); return; }
    setOpenCheck(null);
    if (recordedFor.current === gameId) return;
    recordedFor.current = gameId;
    const fields = finalFields(game, current, statsLocked ? "stats_final" : "recorded", null, true);
    void saveGameFinal(gameId, fields).then(() => onGameChange(fields));
  }, [ready, isFinal, config, game, gameId, plays, prompt, official, statsLocked, names, onGameChange]);

  // One stable object, so the screen's callbacks that list it as a dependency
  // are not rebuilt on every render.
  return useMemo(() => ({
    openCheck,
    isFinal,
    statsLocked,
    official,
    guard,
    saveApproved,
    finalizeFields,
    acceptCurrent,
    prompt,
    confirm: () => prompt?.resolve(true),
    cancel: () => prompt?.resolve(false),
  }), [openCheck, isFinal, statsLocked, official, guard, saveApproved, finalizeFields, acceptCurrent, prompt]);
}

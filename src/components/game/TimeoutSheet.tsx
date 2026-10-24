import type { CSSProperties } from "react";
import { Check, Hand } from "lucide-react";
import { readableAccent } from "@/utils/teamColor";
import ClockInput from "./ClockInput";
import { timeoutCallerLabel, type TimeoutCaller } from "./TimeoutEditModal";
import { quarterLabel } from "./types";
import "@/screens/liveBroadcast.css";

interface Team {
  name: string;
  abbr: string;
  color?: string | null;
  logoUrl?: string | null;
  remaining: number;
}

/**
 * Record Timeout, in the scorebug's language. Each team is a tile carrying
 * its crest, its whole name and its timeouts as the same three amber ticks
 * the scorebug shows, so the operator picks a team, not a word. The names
 * used to share a row of three 100px boxes and lost their ends to "…".
 *
 * Opens with no caller when it comes from the Timeout key (Record stays
 * disabled until one is picked) and on that team when it comes from a tick.
 * A team with none left can't be picked; the official can, always.
 */
export default function TimeoutSheet({
  us, them, quarter, caller, onCaller, seconds, maxSeconds, onSeconds, onRecord, onCancel,
}: {
  us: Team;
  them: Team;
  quarter: number;
  caller: TimeoutCaller | null;
  onCaller: (caller: TimeoutCaller) => void;
  seconds: number;
  maxSeconds: number;
  onSeconds: (seconds: number) => void;
  onRecord: () => void;
  onCancel: () => void;
}) {
  const picked = caller === "us" ? us : caller === "them" ? them : null;
  const recordLabel = caller === null ? "Pick who called it"
    : caller === "official" ? "Record official timeout"
    : `Record ${picked?.abbr || timeoutCallerLabel(caller, us.name, them.name)} timeout`;

  return (
    <div className="sheet bg-black/80">
      <div className="sheet-panel to-sheet" role="dialog" aria-label="Record timeout">
        <header className="to-head">
          <h2>Record timeout</h2>
          <span>{quarterLabel(quarter)} qtr</span>
        </header>

        <div className="to-body">
          <div className="to-cap">Who called it?</div>
          <div className="to-teams" role="radiogroup" aria-label="Who called the timeout">
            <TeamTile team={us} selected={caller === "us"} onPick={() => onCaller("us")} />
            <TeamTile team={them} selected={caller === "them"} onPick={() => onCaller("them")} />
          </div>
          {/* Injury, measurement, equipment: stops the clock, charged to
              neither team, and still reachable when both teams are out. */}
          <button type="button" role="radio" aria-checked={caller === "official"} className="to-official" data-on={caller === "official" || undefined} onClick={() => onCaller("official")}>
            <Hand aria-hidden="true" />
            <span className="t">Official's timeout<small>Injury, measurement, equipment · not charged</small></span>
            {caller === "official" && <Check className="ck" aria-hidden="true" />}
          </button>

          <div className="to-cap">Clock when called</div>
          <ClockInput seconds={seconds} maxSeconds={maxSeconds} autoFocus onChange={onSeconds} />
        </div>

        <footer className="to-foot">
          <button type="button" className="to-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="to-record" disabled={caller === null} onClick={onRecord}
            style={picked ? { "--to-team": readableAccent(picked.color) } as CSSProperties : undefined}>
            {recordLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function TeamTile({ team, selected, onPick }: { team: Team; selected: boolean; onPick: () => void }) {
  const color = readableAccent(team.color);
  const out = team.remaining <= 0;
  return (
    <button type="button" role="radio" aria-checked={selected} disabled={out} onClick={onPick}
      className="to-team" data-on={selected || undefined} style={{ "--to-team": color } as CSSProperties}
      aria-label={`${team.name}, ${team.remaining} timeout${team.remaining === 1 ? "" : "s"} left`}>
      {team.logoUrl
        ? <img src={team.logoUrl} alt="" className="to-crest" />
        : <span className="to-crest" style={{ background: color }} aria-hidden="true">{team.abbr}</span>}
      <span className="to-name">{team.name}</span>
      <span className="to-left">
        <span className="to-ticks" aria-hidden="true">{[0, 1, 2].map(i => <i key={i} data-used={i >= team.remaining || undefined} />)}</span>
        {out ? "None left" : `${team.remaining} left`}
      </span>
      {selected && <Check className="ck" aria-hidden="true" />}
    </button>
  );
}

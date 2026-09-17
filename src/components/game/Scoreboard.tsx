import { ChevronLeft, ChevronRight } from "lucide-react";
import { readableAccent } from "@/utils/teamColor";
import { fmtClock, quarterLabel, type GameState } from "./types";
import "@/screens/liveBroadcast.css";

interface Props {
  state: GameState;
  progName: string;
  oppName: string;
  progAbbr: string;
  oppAbbr: string;
  primaryColor: string;
  progLogoUrl?: string | null;
  oppLogoUrl?: string | null;
  oppColor?: string;
  ballLabel: string;
  onPreviousQuarter: () => void;
  onNextQuarter: () => void;
  canPreviousQuarter: boolean;
  canNextQuarter: boolean;
  onEditClock: () => void;
  onEndGame: () => void;
  onSetDown: (down: number) => void;
  onAdjustDistance: (delta: number) => void;
  onAdjustBall: (delta: number) => void;
  onEditBall: () => void;
  ourTimeoutsRemaining: number;
  theirTimeoutsRemaining: number;
  onTakeTimeout: (team: "us" | "them") => void;
  onCorrectScore?: (team: "us" | "them") => void;
  /** Manual possession correction — tapping the possession chip flips it. */
  onFlipPossession?: () => void;
  /** Read-only: the board is describing a moment other than the live one (a
   *  pending insert), so the corrections — which all edit the LIVE game —
   *  would apply to a situation that is not on screen. Values stay fully
   *  legible; only the controls stand down. */
  locked?: boolean;
}

function downLabel(down: number) {
  return `${down}${down === 1 ? "st" : down === 2 ? "nd" : down === 3 ? "rd" : "th"}`;
}

function TimeoutButtons({
  team,
  remaining,
  onTakeTimeout,
}: {
  team: "us" | "them";
  remaining: number;
  onTakeTimeout: (team: "us" | "them") => void;
}) {
  /* Three amber ticks, like the bug on a broadcast. A used one goes dim. */
  return (
    <div className="lv-tos" aria-label={`${remaining} timeouts left`}>
      {[0, 1, 2].map((slot) => {
        const available = slot < remaining;
        return (
          <button
            key={`${team}-${slot}`}
            type="button"
            onClick={() => onTakeTimeout(team)}
            disabled={!available}
            title={`${team === "us" ? "Program" : "Opponent"} timeout`}
            aria-label={available ? "Take timeout" : "Timeout used"}
          />
        );
      })}
    </div>
  );
}

function Crest({ logoUrl, abbr, color }: { logoUrl?: string | null; abbr: string; color: string }) {
  if (logoUrl) return <img src={logoUrl} alt="" className="lv-crest" style={{ background: "transparent" }} />;
  return <span className="lv-crest" style={{ background: color }} aria-hidden="true">{abbr}</span>;
}

/**
 * The scorebug. Crests, timeouts and possession on either side, the clock in
 * the middle, End Game on the right at tablet width; under it the situation
 * strip — down, to go, ball on — as segmented control and steppers. Every
 * handler is the same as before; only the drawing changed.
 *
 * The strip labels and the ±5 nudges appear from lg up. On a phone the three
 * cells share one 36px row (down segments, to-go stepper, ball-on stepper),
 * which is what fits beside the field without pushing the play buttons off
 * the bottom.
 */
export default function Scoreboard({
  state,
  progName,
  oppName,
  progAbbr,
  oppAbbr,
  primaryColor,
  progLogoUrl,
  oppLogoUrl,
  oppColor,
  ballLabel,
  onPreviousQuarter,
  onNextQuarter,
  canPreviousQuarter,
  canNextQuarter,
  onEditClock,
  onEndGame,
  onSetDown,
  onAdjustDistance,
  onAdjustBall,
  onEditBall,
  ourTimeoutsRemaining,
  theirTimeoutsRemaining,
  onTakeTimeout,
  onCorrectScore,
  onFlipPossession,
  locked = false,
}: Props) {
  /* The crests are filled with the team colour, so a black-wearing team
     needs its swatch lifted just enough to read as a tile on the black bar. */
  const effOppColor = readableAccent(oppColor);
  const effPrimaryColor = readableAccent(primaryColor);
  const possessionLabel = state.possession === "us" ? `${progAbbr} BALL` : `${oppAbbr} BALL`;
  const distanceLabel = state.ballOn + state.distance >= 100 ? "Goal" : String(state.distance);

  return (
    <div className="lv-bug">
      <div className="lv-bug-row">
        <div className={`lv-team l ${state.possession === "us" ? "poss" : ""}`}>
          <Crest logoUrl={progLogoUrl} abbr={progAbbr} color={effPrimaryColor} />
          <div style={{ minWidth: 0 }}>
            <div className="lv-tname" title={progName}><span className="lg:hidden">{progAbbr || progName}</span><span className="hidden lg:inline">{progName}</span></div>
            <TimeoutButtons team="us" remaining={ourTimeoutsRemaining} onTakeTimeout={onTakeTimeout} />
          </div>
          <button type="button" className="lv-score" onClick={() => onCorrectScore?.("us")} title="Tap to correct score">
            {state.ourScore}
          </button>
        </div>

        <div className="lv-center">
          <div className="lv-qtr">
            <button type="button" onClick={onPreviousQuarter} disabled={locked || !canPreviousQuarter} title="Previous quarter" aria-label="Previous quarter">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span>{quarterLabel(state.quarter)}</span>
            <button type="button" onClick={onNextQuarter} disabled={locked || !canNextQuarter} title="Next quarter" aria-label="Next quarter">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <button type="button" className="lv-clock" onClick={onEditClock} disabled={locked} title="Edit clock">
            {fmtClock(state.clock)}
          </button>
          <button type="button" className="lv-poss" onClick={onFlipPossession} disabled={locked} title="Tap to flip possession (manual correction)">
            {possessionLabel}
          </button>
        </div>

        <div className={`lv-team r ${state.possession === "them" ? "poss" : ""}`}>
          <Crest logoUrl={oppLogoUrl} abbr={oppAbbr} color={effOppColor} />
          <div style={{ minWidth: 0 }}>
            <div className="lv-tname" title={oppName}><span className="lg:hidden">{oppAbbr || oppName}</span><span className="hidden lg:inline">{oppName}</span></div>
            <TimeoutButtons team="them" remaining={theirTimeoutsRemaining} onTakeTimeout={onTakeTimeout} />
          </div>
          <button type="button" className="lv-score" onClick={() => onCorrectScore?.("them")} title="Tap to correct score">
            {state.theirScore}
          </button>
        </div>

        <button type="button" className="lv-end" onClick={onEndGame} title="End Game">End Game</button>
      </div>

      {locked ? (
        <div className="lv-locked scoreboard-situation">
          <strong>{downLabel(state.down)} &amp; {state.distance}</strong>
          <span>Starting spot: {ballLabel}</span>
        </div>
      ) : (
        <div className="lv-sit">
          <div className="lv-cell">
            <span className="lab">Down</span>
            <div className="lv-seg">
              {[1, 2, 3, 4].map((down) => (
                <button key={down} type="button" onClick={() => onSetDown(down)} className={state.down === down ? "on" : ""}>
                  {downLabel(down)}
                </button>
              ))}
            </div>
          </div>

          <div className="lv-cell">
            <span className="lab">To go</span>
            <div className="lv-step">
              <button type="button" onClick={() => onAdjustDistance(-1)} title="Decrease distance">−</button>
              {/* Amber, not chrome: on a phone this stepper is how the spot is
                  actually set, so it stays at full strength. */}
              <span className="v amber">{distanceLabel}</span>
              <button type="button" onClick={() => onAdjustDistance(1)} title="Increase distance">+</button>
            </div>
          </div>

          <div className="lv-cell spot">
            <span className="lab">Ball on</span>
            <div className="lv-step">
              <button type="button" className="wide" onClick={() => onAdjustBall(-5)} title="Move ball back 5 yards">−5</button>
              <button type="button" onClick={() => onAdjustBall(-1)} title="Move ball back 1 yard">−</button>
              <button type="button" className="v" onClick={onEditBall} title="Set ball spot">{ballLabel}</button>
              <button type="button" onClick={() => onAdjustBall(1)} title="Move ball forward 1 yard">+</button>
              <button type="button" className="wide" onClick={() => onAdjustBall(5)} title="Move ball forward 5 yards">+5</button>
            </div>
          </div>

          <div className="lv-sum">
            <div>
              <div className="sm">{possessionLabel}</div>
              <div className="big">{downLabel(state.down)} <em>&amp;</em> {distanceLabel}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2, Trash2, X } from "lucide-react";
import "./editPlay.css";

/**
 * The edit-a-play screen: the whole play on one summary, every line a tap
 * away from the control that changes it.
 *
 * It used to be the entry wizard run backwards - step 1 of 5, Save only on
 * the last step - so fixing a tackler meant tapping Next through the passer,
 * the receiver and the spot first, and the iPad drew it as a phone-width
 * sheet in the middle of the screen. This component is only the frame: the
 * controls inside each pane are the entry modal's own steps, so a change made
 * here runs through exactly the arithmetic that recorded the play.
 *
 * Phone: the summary, or one pane at a time with Done back to the summary.
 * iPad (>= 1024px): summary on the left, the open pane on the right.
 */

export interface EditSide {
  /** Team tag, e.g. "PL". */
  tag: string;
  /** A colour readable on the dark panel. */
  color: string;
}

export interface EditRow {
  id: string;
  label: string;
  value: ReactNode;
  /** Plain text of the value, for change tracking and the accessible name. */
  text: string;
  sub?: string;
  side?: EditSide | null;
  /** amber = not a confirmed pick (the modal's convention), dim = nothing
   *  recorded, warn = needs an answer before saving. */
  tone?: "amber" | "dim" | "warn";
  /** Absent: read-only. */
  onOpen?: () => void;
  active?: boolean;
  changed?: boolean;
  /** A control drawn in the row itself instead of a pane (hash chips). */
  inline?: ReactNode;
}

export interface EditSection {
  id: string;
  title: string;
  note?: string;
  rows: EditRow[];
}

export interface EditToggle {
  id: string;
  label: string;
  on?: boolean;
  onClick: () => void;
}

export interface EditPane {
  title?: string;
  hint?: string;
  body: ReactNode;
  /** The footer button, which closes the pane. "Cancel" where the pane has
   *  its own save inside it. */
  doneLabel?: string;
}

export interface EditNav {
  prev?: { label: string; onClick: () => void };
  next?: { label: string; onClick: () => void };
}

interface Props {
  title: string;
  subtitle: string;
  bug: {
    situation: string; spot?: string; clock: string; description: string; color: string;
    /** A button on the bug itself - the Film Chart's Change start. */
    action?: { label: string; onClick: () => void; active?: boolean } | null;
  };
  /** The tag beside the title. */
  pill?: string | null;
  sections: EditSection[];
  toggles: EditToggle[];
  /** Sections drawn after the toggles - the Film Chart's charting, which is
   *  not stats, so the stat toggles stay with the stat lines above. */
  tail?: EditSection[];
  /** Questions that must be answered on the summary itself (goal to go). */
  notices?: ReactNode;
  pane: EditPane | null;
  onClosePane: () => void;
  onClose: () => void;
  saving: boolean;
  /** The save in flight is Save & next, so that is the button that spins. */
  savingNext?: boolean;
  canSave: boolean;
  /** Why Save is off, shown above it. */
  saveBlocker?: string | null;
  /** A save that failed, shown above Save until the next try. */
  saveError?: string | null;
  changes: number;
  /** Absent: nothing here can be changed, and the footer is only Close. */
  onSave?: () => void;
  saveLabel?: string;
  /** A second save action, e.g. the Film Chart's Save & next. */
  saveNext?: { label: string; onClick: () => void } | null;
  onDelete?: () => void;
  nav?: EditNav | null;
  /** What the right-hand column says on the iPad with no pane open. */
  emptyText?: { big: string; small: string };
}

export default function EditPlayLayout({
  title, subtitle, bug, pill = "Editing", sections, toggles, tail = [], notices, pane, onClosePane, onClose,
  saving, savingNext = false, canSave, saveBlocker, saveError, changes, onSave, saveLabel = "Save Changes", saveNext, onDelete, nav,
  emptyText = { big: "Tap any line to change it", small: "Players, the spot, the clock and the flag all open here. Save when the play reads right." },
}: Props) {
  const paneOpen = pane != null;
  const changeNote = changes > 0 ? `${changes} ${changes === 1 ? "change" : "changes"}` : null;
  return (
    <div className="sheet bg-black/70 backdrop-blur-sm">
      <div className="ep-panel" data-pane={paneOpen ? "open" : "closed"} role="dialog" aria-label={title}>
        <header className="ep-head">
          {paneOpen && (
            <button type="button" className="ep-icon ep-back" onClick={onClosePane} aria-label="Back to the play">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <button type="button" className={`ep-icon ${paneOpen ? "ep-close-wide" : ""}`} onClick={onClose} aria-label="Close without saving">
            <X className="w-5 h-5" />
          </button>
          <div className="ep-title">
            <h2>{title}{pill && <span className="ep-pill">{pill}</span>}</h2>
            <p>{subtitle}</p>
          </div>
          {nav && (nav.prev || nav.next) && (
            <div className="ep-nav">
              <button type="button" onClick={nav.prev?.onClick} disabled={!nav.prev || saving} aria-label={nav.prev ? `Previous play, ${nav.prev.label}` : "No previous play"}>
                <ChevronLeft className="w-4 h-4" />{nav.prev?.label ?? ""}
              </button>
              <button type="button" onClick={nav.next?.onClick} disabled={!nav.next || saving} aria-label={nav.next ? `Next play, ${nav.next.label}` : "No next play"}>
                {nav.next?.label ?? ""}<ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </header>

        <div className="ep-body">
          <section className="ep-col ep-sum" aria-label="The play">
            <div className="ep-scroll">
              <div className="ep-bug" style={{ "--team": bug.color } as CSSProperties}>
                <div className="ep-sit">
                  <span className="dd">{bug.situation}</span>
                  {bug.spot && <span className="at">{bug.spot}</span>}
                  <span className="q">{bug.clock}</span>
                </div>
                <div className="ep-desc-row">
                  <p className="ep-desc">{bug.description}</p>
                  {bug.action && (
                    <button type="button" className="ep-bug-act" onClick={bug.action.onClick} aria-pressed={bug.action.active || undefined}>
                      {bug.action.label}
                    </button>
                  )}
                </div>
              </div>

              {notices}

              {sections.map(section => section.rows.length > 0 && (
                <div key={section.id} className="ep-sec">
                  <div className="ep-sec-h"><span>{section.title}</span>{section.note && <i>{section.note}</i>}</div>
                  {section.rows.map(row => <Row key={row.id} row={row} />)}
                </div>
              ))}

              {toggles.length > 0 && (
                <div className="ep-sec">
                  <div className="ep-sec-h"><span>Add to this play</span></div>
                  <div className="ep-adds">
                    {toggles.map(t => (
                      <button key={t.id} type="button" className="ep-add" aria-pressed={!!t.on} onClick={t.onClick}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {tail.map(section => section.rows.length > 0 && (
                <div key={section.id} className="ep-sec">
                  <div className="ep-sec-h"><span>{section.title}</span>{section.note && <i>{section.note}</i>}</div>
                  {section.rows.map(row => <Row key={row.id} row={row} />)}
                </div>
              ))}
            </div>

            <footer className="ep-foot">
              {saveError
                ? <p className="ep-blocker" role="alert">{saveError}</p>
                : saveBlocker && <p className="ep-blocker" role="status">{saveBlocker}</p>}
              <div className="ep-foot-row">
                {!onSave && (
                  <button type="button" className="ep-save2 ep-wide" onClick={onClose}>Close</button>
                )}
                {onSave && onDelete && (
                  <button type="button" className="ep-del" disabled={saving} title="Delete play" aria-label="Delete play"
                    onClick={() => { if (window.confirm("Delete this play? Everything after it re-chains.")) onDelete(); }}>
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                {onSave && saveNext && (
                  <>
                    <button type="button" className="ep-save2" onClick={onSave} disabled={!canSave || saving} aria-busy={saving && !savingNext}>
                      {saving && !savingNext ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
                      {saving && !savingNext ? "Saving…" : "Save"}
                    </button>
                    <button type="button" className="ep-save" onClick={saveNext.onClick} disabled={!canSave || saving} aria-busy={saving && savingNext}>
                      {saving && savingNext && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                      {saving && savingNext ? "Saving…" : saveNext.label}
                      {!saving && changeNote && <small>· {changeNote}</small>}
                    </button>
                  </>
                )}
                {onSave && !saveNext && (
                  <button type="button" className="ep-save" onClick={onSave} disabled={!canSave || saving} aria-busy={saving}>
                    {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                    {saving ? "Saving…" : saveLabel}
                    {!saving && changeNote && <small>· {changeNote}</small>}
                  </button>
                )}
              </div>
            </footer>
          </section>

          <section className="ep-col ep-pane" aria-label={pane?.title ?? "Change a line"}>
            {pane ? (
              <>
                {pane.title && (
                  <div className="ep-pane-h" aria-live="polite">
                    <h3>{pane.title}</h3>
                    {pane.hint && <p>{pane.hint}</p>}
                  </div>
                )}
                <div className="ep-pane-body">{pane.body}</div>
                <footer className="ep-pane-foot">
                  <button type="button" className="ep-done" onClick={onClosePane}>{pane.doneLabel ?? "Done"}</button>
                </footer>
              </>
            ) : (
              <div className="ep-empty">
                <p className="big">{emptyText.big}</p>
                <p>{emptyText.small}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ row }: { row: EditRow }) {
  const body = (
    <>
      <span className="ep-k">{row.label}{row.changed && <i aria-label="changed" />}</span>
      <span className={`ep-v ${row.tone ?? ""}`}>
        {row.side && <span className="ep-side" style={{ "--side": row.side.color } as CSSProperties}>{row.side.tag}</span>}
        {row.value}
        {row.sub && <small>{row.sub}</small>}
      </span>
    </>
  );
  if (row.inline) {
    return <div className="ep-row" data-changed={row.changed || undefined}>{body}<span className="ep-inline">{row.inline}</span></div>;
  }
  if (!row.onOpen) {
    return <div className="ep-row ep-ro" data-changed={row.changed || undefined}>{body}</div>;
  }
  return (
    <button type="button" className="ep-row" onClick={row.onOpen} aria-current={row.active || undefined}
      aria-label={`${row.label}: ${row.text}${row.sub ? `, ${row.sub}` : ""}. Tap to change.`}
      data-changed={row.changed || undefined}>
      {body}
      <ChevronRight className="ep-chev w-5 h-5" aria-hidden />
    </button>
  );
}

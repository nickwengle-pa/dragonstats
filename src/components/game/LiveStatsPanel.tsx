import { useState } from "react";
import { X } from "lucide-react";
import type {
  GameSummary,
  PassingStats,
  RushingStats,
  ReceivingStats,
  DefensiveStats,
} from "football-stats-engine";
import DrivesList from "./DrivesList";

interface Props {
  summary: GameSummary | null;
  rosterNameById: Record<string, string>;
  oppPlayerNameById: Record<string, string>;
  programTeamId: string;
  opponentTeamId: string;
  onClose: () => void;
}

type Tab = "off" | "def" | "st" | "drives";

/**
 * Pure presentation. Renders the engine GameSummary as a compact per-player
 * view. Updates per play because GameScreen re-derives the summary via
 * replayLiveGame on every plays change.
 */
export default function LiveStatsPanel({
  summary,
  rosterNameById,
  oppPlayerNameById,
  programTeamId,
  onClose,
}: Props) {
  if (!summary) {
    return (
      <Shell onClose={onClose}>
        <div className="p-6 text-center text-sm text-surface-muted">
          Stats will populate after the first play is recorded.
        </div>
      </Shell>
    );
  }

  const nameFor = (id: string) =>
    rosterNameById[id] ?? oppPlayerNameById[id] ?? id;

  return (
    <Shell onClose={onClose}>
      <Tabs summary={summary} nameFor={nameFor} programTeamId={programTeamId} />
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">
      <div className="bg-surface-bg w-full sm:w-[480px] max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-surface-border shadow-2xl">
        <div className="sticky top-0 bg-surface-bg/95 backdrop-blur border-b border-surface-border px-4 py-3 flex items-center gap-2">
          <h2 className="text-sm font-display font-black uppercase tracking-widest flex-1">
            Live Stats
          </h2>
          <button onClick={onClose} className="p-1 text-surface-muted hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Tabs({
  summary,
  nameFor,
  programTeamId,
}: {
  summary: GameSummary;
  nameFor: (id: string) => string;
  programTeamId: string;
}) {
  // Tabs are local UI state; component is small enough to avoid lifting.
  return (
    <TabContainer
      tabs={[
        { id: "off", label: "Off", render: () => <OffenseTab summary={summary} nameFor={nameFor} /> },
        { id: "def", label: "Def", render: () => <DefenseTab summary={summary} nameFor={nameFor} /> },
        { id: "st", label: "ST", render: () => <SpecialTeamsTab summary={summary} nameFor={nameFor} /> },
        {
          id: "drives",
          label: "Drives",
          render: () => (
            <DrivesList
              drives={summary.drives}
              programTeamId={programTeamId}
              programAbbr={summary.homeTeam.id === programTeamId ? summary.homeTeam.abbreviation : summary.awayTeam.abbreviation}
              opponentAbbr={summary.homeTeam.id === programTeamId ? summary.awayTeam.abbreviation : summary.homeTeam.abbreviation}
            />
          ),
        },
      ]}
    />
  );
}

function TabContainer({
  tabs,
}: {
  tabs: Array<{ id: Tab; label: string; render: () => React.ReactNode }>;
}) {
  const [active, setActive] = useTabState(tabs[0]?.id ?? "off");
  const current = tabs.find((t) => t.id === active);
  return (
    <div>
      <div className="flex gap-1 px-3 pt-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`flex-1 py-2 rounded-lg text-[11px] font-display font-black uppercase tracking-widest transition-colors ${
              active === t.id
                ? "bg-dragon-primary/20 text-dragon-primary border border-dragon-primary/30"
                : "bg-surface-hover text-surface-muted border border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-3">{current?.render()}</div>
    </div>
  );
}

function useTabState(initial: Tab): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>(initial);
  return [tab, setTab];
}

function OffenseTab({ summary, nameFor }: { summary: GameSummary; nameFor: (id: string) => string }) {
  const passing = Object.entries(summary.passing ?? {});
  const rushing = Object.entries(summary.rushing ?? {});
  const receiving = Object.entries(summary.receiving ?? {});

  return (
    <div className="space-y-4">
      <Section title="Passing">
        {passing.length === 0 ? (
          <Empty>No passing plays yet</Empty>
        ) : (
          <Table
            headers={["Player", "CMP/ATT", "YDS", "TD", "INT", "RTG"]}
            rows={passing.map(([id, s]) => [
              nameFor(id),
              `${(s as PassingStats).completions}/${(s as PassingStats).attempts}`,
              (s as PassingStats).yards,
              (s as PassingStats).touchdowns,
              (s as PassingStats).interceptions,
              typeof (s as PassingStats).passerRating === "number"
                ? (s as PassingStats).passerRating!.toFixed(1)
                : "—",
            ])}
          />
        )}
      </Section>

      <Section title="Rushing">
        {rushing.length === 0 ? (
          <Empty>No rushing plays yet</Empty>
        ) : (
          <Table
            headers={["Player", "CAR", "YDS", "AVG", "TD", "LNG"]}
            rows={rushing.map(([id, s]) => {
              const rs = s as RushingStats;
              return [
                nameFor(id),
                rs.carries,
                rs.yards,
                rs.carries > 0 ? (rs.yards / rs.carries).toFixed(1) : "0.0",
                rs.touchdowns,
                rs.longRush ?? 0,
              ];
            })}
          />
        )}
      </Section>

      <Section title="Receiving">
        {receiving.length === 0 ? (
          <Empty>No receiving plays yet</Empty>
        ) : (
          <Table
            headers={["Player", "REC", "TGT", "YDS", "TD", "LNG"]}
            rows={receiving.map(([id, s]) => {
              const rs = s as ReceivingStats;
              return [
                nameFor(id),
                rs.receptions,
                rs.targets,
                rs.yards,
                rs.touchdowns,
                rs.longReception ?? 0,
              ];
            })}
          />
        )}
      </Section>
    </div>
  );
}

function DefenseTab({ summary, nameFor }: { summary: GameSummary; nameFor: (id: string) => string }) {
  const defense = Object.entries(summary.defense ?? {});
  if (defense.length === 0) return <Empty>No defensive stats yet</Empty>;
  return (
    <Table
      headers={["Player", "TKL", "SCK", "TFL", "INT", "PBU", "FF", "FR"]}
      rows={defense.map(([id, s]) => {
        const ds = s as DefensiveStats;
        return [
          nameFor(id),
          ds.totalTackles?.toFixed(1) ?? "0",
          ds.sacks ?? 0,
          ds.tacklesForLoss ?? 0,
          ds.interceptions ?? 0,
          ds.passesDefended ?? 0,
          ds.forcedFumbles ?? 0,
          ds.fumbleRecoveries ?? 0,
        ];
      })}
    />
  );
}

function SpecialTeamsTab({ summary, nameFor }: { summary: GameSummary; nameFor: (id: string) => string }) {
  const kicking = Object.entries(summary.kicking ?? {});
  const punting = Object.entries(summary.punting ?? {});
  const returns = Object.entries(summary.returns ?? {});

  return (
    <div className="space-y-4">
      <Section title="Kicking (FG / PAT)">
        {kicking.length === 0 ? (
          <Empty>No kicks yet</Empty>
        ) : (
          <Table
            headers={["Player", "FG", "FG%", "PAT", "LNG"]}
            rows={kicking.map(([id, s]: [string, any]) => [
              nameFor(id),
              `${s.fieldGoalMade ?? 0}/${s.fieldGoalAttempts ?? 0}`,
              s.fieldGoalAttempts > 0
                ? `${Math.round(((s.fieldGoalMade ?? 0) / s.fieldGoalAttempts) * 100)}%`
                : "—",
              `${s.extraPointMade ?? 0}/${s.extraPointAttempts ?? 0}`,
              s.fieldGoalLong ?? 0,
            ])}
          />
        )}
      </Section>

      <Section title="Punting">
        {punting.length === 0 ? (
          <Empty>No punts yet</Empty>
        ) : (
          <Table
            headers={["Player", "PUNTS", "YDS", "AVG", "LNG"]}
            rows={punting.map(([id, s]: [string, any]) => [
              nameFor(id),
              s.punts ?? 0,
              s.puntYards ?? 0,
              s.puntAverage?.toFixed(1) ?? "0.0",
              s.puntLong ?? 0,
            ])}
          />
        )}
      </Section>

      <Section title="Returns">
        {returns.length === 0 ? (
          <Empty>No returns yet</Empty>
        ) : (
          <Table
            headers={["Player", "KR", "KR YDS", "PR", "PR YDS", "TD"]}
            rows={returns.map(([id, s]: [string, any]) => [
              nameFor(id),
              s.kickReturns ?? 0,
              s.kickReturnYards ?? 0,
              s.puntReturns ?? 0,
              s.puntReturnYards ?? 0,
              (s.kickReturnTouchdowns ?? 0) + (s.puntReturnTouchdowns ?? 0),
            ])}
          />
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="section-title text-[10px] mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-surface-muted italic px-1 py-2">{children}</div>;
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-muted">
            {headers.map((h) => (
              <th key={h} className="text-left font-bold py-1.5 px-1.5 first:pl-0 last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-surface-border/40">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`py-1.5 px-1.5 first:pl-0 last:pr-0 ${j === 0 ? "font-bold" : "text-surface-muted"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

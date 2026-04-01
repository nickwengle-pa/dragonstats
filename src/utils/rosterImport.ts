/**
 * Roster import utilities — CSV and MaxPreps parsers.
 * Ported from football-stats-app's TeamManager logic.
 */

export interface ParsedPlayer {
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  position: string | null;
  positions: string[];
  classification: string | null;
  graduationYear: number | null;
  heightInches: number | null;
  weightLbs: number | null;
}

export interface ParseResult {
  players: ParsedPlayer[];
  issues: string[];
}

/* ─── Helpers ─── */

const GRADE_OFFSETS: Record<string, number> = {
  sr: 0, senior: 0,
  jr: 1, junior: 1,
  so: 2, soph: 2, sophomore: 2,
  fr: 3, freshman: 3,
  "8th": 4, "8thgrade": 4,
  "7th": 5, "7thgrade": 5,
  "6th": 6, "6thgrade": 6,
};

function normalizeGradeKey(value: string): string {
  const key = value.toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  if (GRADE_OFFSETS[key] !== undefined) return key;
  if (key.startsWith("senior")) return "senior";
  if (key.startsWith("junior")) return "junior";
  if (key.startsWith("soph")) return "soph";
  if (key.startsWith("fresh")) return "freshman";
  if (key.startsWith("eight")) return "8th";
  if (key.startsWith("seven")) return "7th";
  if (key.startsWith("six")) return "6th";
  return key;
}

function gradeToClassification(grade: string): string | null {
  const key = normalizeGradeKey(grade);
  if (["sr", "senior"].includes(key)) return "SR";
  if (["jr", "junior"].includes(key)) return "JR";
  if (["so", "soph", "sophomore"].includes(key)) return "SO";
  if (["fr", "freshman"].includes(key)) return "FR";
  return null;
}

function isHeightValue(v: string): boolean {
  const n = v.toLowerCase().replace(/\s+/g, "");
  if (n === "-" || n === "") return true;
  return /^(\d{1,2}'\d{0,2}"?|\d{1,2}"|-\s*)$/.test(n);
}

function parseHeightInches(v?: string): number | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || t === "-") return null;
  const m = t.match(/(\d{1,2})\s*'\s*(\d{1,2})"?/);
  if (m) return Number(m[1]) * 12 + Number(m[2] ?? 0);
  return null;
}

function isWeightValue(v: string): boolean {
  const n = v.toLowerCase().replace(/\s+/g, "");
  if (n === "-" || n === "") return true;
  return /^\d{2,3}(lbs|pounds)?$/.test(n);
}

function parseWeight(v?: string): number | null {
  if (!v) return null;
  const n = v.toLowerCase().replace(/\s+/g, "");
  if (!n || n === "-") return null;
  const m = n.match(/^(\d{2,3})(?:lbs|pounds)?$/);
  return m ? Number(m[1]) : null;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  const last = parts.pop()!;
  return { first: parts.join(" "), last };
}

/* ─────────────────────────────────────────────
   CSV / Tab-Delimited Parser
   ─────────────────────────────────────────────
   Accepts lines like:
     22, Marcus Johnson, QB, JR
     #5	John Smith	WR/RB	SO	2027
   Columns (flexible order detection):
     jersey, name, position, class/grade, grad year
   ───────────────────────────────────────────── */

export function parseCSVRoster(raw: string, seasonYear?: number): ParseResult {
  const issues: string[] = [];
  const players: ParsedPlayer[] = [];
  const lines = raw.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    return { players, issues: ["No data to parse."] };
  }

  // Detect delimiter: tab or comma
  const firstLine = lines[0];
  const delim = firstLine.includes("\t") ? "\t" : ",";

  // Check if first line is a header
  const headerTest = firstLine.toLowerCase();
  const isHeader = ["name", "player", "jersey", "number", "#", "position", "pos"].some(h => headerTest.includes(h));
  const startIdx = isHeader ? 1 : 0;

  const seenKeys = new Set<string>();

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split(delim).map(c => c.trim()).filter(Boolean);
    if (cols.length < 2) {
      issues.push(`Line ${i + 1}: too few columns, skipped.`);
      continue;
    }

    let jerseyNumber: number | null = null;
    let nameStr = "";
    let posStr = "";
    let classStr = "";
    let gradYearStr = "";

    // If first col looks like a number, treat as jersey
    const firstClean = cols[0].replace(/^#/, "");
    if (/^\d{1,3}$/.test(firstClean)) {
      jerseyNumber = Number(firstClean);
      nameStr = cols[1] ?? "";
      posStr = cols[2] ?? "";
      classStr = cols[3] ?? "";
      gradYearStr = cols[4] ?? "";
    } else {
      // First col is name
      nameStr = cols[0];
      // Try to detect jersey in col[1]
      const secondClean = (cols[1] ?? "").replace(/^#/, "");
      if (/^\d{1,3}$/.test(secondClean)) {
        jerseyNumber = Number(secondClean);
        posStr = cols[2] ?? "";
        classStr = cols[3] ?? "";
        gradYearStr = cols[4] ?? "";
      } else {
        posStr = cols[1] ?? "";
        classStr = cols[2] ?? "";
        gradYearStr = cols[3] ?? "";
      }
    }

    if (!nameStr) {
      issues.push(`Line ${i + 1}: no name found, skipped.`);
      continue;
    }

    const { first, last } = splitName(nameStr);
    const positions = posStr
      ? posStr.split(/[,/]/).map(p => p.trim().toUpperCase()).filter(Boolean)
      : [];

    const classification = gradeToClassification(classStr);
    let graduationYear: number | null = null;

    if (/^\d{4}$/.test(gradYearStr)) {
      graduationYear = Number(gradYearStr);
    } else if (classification && seasonYear) {
      const gk = normalizeGradeKey(classStr);
      const offset = GRADE_OFFSETS[gk];
      if (offset !== undefined) graduationYear = seasonYear + offset;
    }

    const dedupeKey = `${first.toLowerCase()}-${last.toLowerCase()}-${jerseyNumber ?? "na"}`;
    if (seenKeys.has(dedupeKey)) {
      issues.push(`Duplicate: ${first} ${last} skipped.`);
      continue;
    }
    seenKeys.add(dedupeKey);

    players.push({
      firstName: first,
      lastName: last,
      jerseyNumber,
      position: positions[0] ?? null,
      positions,
      classification,
      graduationYear,
      heightInches: null,
      weightLbs: null,
    });
  }

  if (!players.length && !issues.length) {
    issues.push("No players could be parsed from the text.");
  }

  return { players, issues };
}

/* ─────────────────────────────────────────────
   MaxPreps Roster Parser
   ─────────────────────────────────────────────
   Expects copy-pasted text from a MaxPreps
   roster page with the header row:
     # Player Grade Position Height Weight
   ───────────────────────────────────────────── */

export function parseMaxPrepsRoster(raw: string, seasonYear?: number): ParseResult {
  const issues: string[] = [];
  const players: ParsedPlayer[] = [];

  if (!raw.trim()) {
    return { players, issues: ["No roster text provided."] };
  }

  const sections = raw.replace(/\r/g, "").split(/#\s*Player\s*Grade\s*Position\s*Height\s*Weight/i);
  if (sections.length <= 1) {
    return { players, issues: ['Could not find the roster header "# Player Grade Position Height Weight".'] };
  }

  const section = sections[1];
  const lines = section
    .split("\n")
    .map(l => l.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  const endTokens = [
    /^volunteer/i, /^help the coach/i, /^roster last updated/i,
    /^print$/i, /^latest videos/i, /^contribute to the team/i,
  ];

  const seenKeys = new Set<string>();
  let idx = 0;

  while (idx < lines.length) {
    // Find jersey number line
    let jerseyLine: string | undefined;
    while (idx < lines.length) {
      const candidate = lines[idx++];
      if (endTokens.some(r => r.test(candidate))) { idx = lines.length; break; }
      const normalized = candidate.replace(/^#/, "");
      if (/^\d{1,3}$/.test(normalized)) { jerseyLine = normalized; break; }
    }
    if (!jerseyLine) break;

    // Find name line
    let nameLine: string | undefined;
    while (idx < lines.length) {
      const candidate = lines[idx++];
      if (!candidate) continue;
      if (/^#\s*player/i.test(candidate)) { idx -= 1; break; }
      nameLine = candidate.replace(/\s+/g, " ").trim();
      break;
    }
    if (!nameLine) {
      issues.push(`Skipped #${jerseyLine}: missing player name.`);
      continue;
    }

    // Find details line (grade, position, height, weight)
    let detailsLine: string | undefined;
    while (idx < lines.length) {
      const candidate = lines[idx++];
      if (!candidate) continue;
      detailsLine = candidate;
      break;
    }
    if (!detailsLine) {
      issues.push(`Skipped ${nameLine}: missing grade/position info.`);
      continue;
    }

    // Parse segments
    let segments = detailsLine.split(/\t+/).map(s => s.trim()).filter(Boolean);
    if (segments.length <= 1) {
      segments = detailsLine.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    }
    if (!segments.length) {
      issues.push(`Skipped ${nameLine}: could not parse columns.`);
      continue;
    }

    const gradeLabel = segments[0];
    const gradeKey = normalizeGradeKey(gradeLabel);
    if (GRADE_OFFSETS[gradeKey] === undefined) {
      issues.push(`Skipped ${nameLine}: grade "${gradeLabel}" not recognized.`);
      continue;
    }

    const remaining = segments.slice(1);
    const positionBuffer: string[] = [];
    let heightRaw: string | undefined;
    let weightRaw: string | undefined;

    for (const seg of remaining) {
      if (!heightRaw && isHeightValue(seg)) { heightRaw = seg; continue; }
      if (!weightRaw && isWeightValue(seg)) { weightRaw = seg; continue; }
      positionBuffer.push(seg);
    }

    const posStr = positionBuffer.join(" ").replace(/\s+/g, " ").trim();
    const positions = posStr.length > 0
      ? posStr.split(/[,/]/).map(v => v.trim().toUpperCase()).filter(Boolean)
      : [];

    const jerseyNumber = /\d{1,3}/.test(jerseyLine) ? Number(jerseyLine.match(/\d{1,3}/)![0]) : null;
    const classification = gradeToClassification(gradeLabel);
    let graduationYear: number | null = null;
    const offset = GRADE_OFFSETS[gradeKey];
    if (seasonYear !== undefined && offset !== undefined) {
      graduationYear = seasonYear + offset;
    }

    const { first, last } = splitName(nameLine);
    const heightInches = parseHeightInches(heightRaw);
    const weightLbs = parseWeight(weightRaw);

    const dedupeKey = `${nameLine.toLowerCase()}-${jerseyNumber ?? "na"}`;
    if (seenKeys.has(dedupeKey)) {
      issues.push(`Duplicate: ${nameLine} skipped.`);
      continue;
    }
    seenKeys.add(dedupeKey);

    players.push({
      firstName: first,
      lastName: last,
      jerseyNumber,
      position: positions[0] ?? null,
      positions,
      classification,
      graduationYear,
      heightInches,
      weightLbs,
    });
  }

  if (!players.length && !issues.length) {
    issues.push("No players could be parsed from the pasted text.");
  }

  return { players, issues };
}

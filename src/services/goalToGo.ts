export interface GoalSituation {
  ballOn: number;
  distance: number;
  goalToGo?: boolean;
}

export function canChooseGoalToGo(situation: GoalSituation & { down: number }): boolean {
  return situation.ballOn === 90 && situation.down === 1 && situation.distance === 10;
}

export function isGoalToGo(situation: GoalSituation): boolean {
  if (typeof situation.goalToGo === "boolean") return situation.goalToGo;
  return situation.ballOn + situation.distance >= 100
    && !(situation.ballOn === 90 && situation.distance === 10);
}

export function distanceLabel(situation: GoalSituation): string {
  return isGoalToGo(situation) ? "G" : String(situation.distance);
}

export function storedGoalToGo(data: Record<string, unknown> | null | undefined, key = "goal_to_go"): boolean | undefined {
  return typeof data?.[key] === "boolean" ? data[key] as boolean : undefined;
}

/** An explicit ruling belongs to the series, not just the current yard line. */
export function carryGoalToGo<T extends GoalSituation & { possession: string }>(
  next: T, before: GoalSituation & { possession: string }, newSeries = false,
): T & { goalToGo?: boolean } {
  if (typeof next.goalToGo === "boolean") return next;
  if (!newSeries && next.possession === before.possession
    && typeof before.goalToGo === "boolean"
    && next.ballOn + next.distance === before.ballOn + before.distance) {
    return { ...next, goalToGo: before.goalToGo };
  }
  if (newSeries && "goalToGo" in next) {
    const { goalToGo: _goal, ...fresh } = next;
    return fresh as T;
  }
  return next;
}

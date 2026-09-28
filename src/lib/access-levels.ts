/** مستويات الوصول للصفحات ومساحات الفرق */
export type AccessLevelName = "NONE" | "VIEW" | "COMMENT" | "EDIT" | "FULL";

export const LEVEL_RANK: Record<AccessLevelName, number> = { NONE: 0, VIEW: 1, COMMENT: 2, EDIT: 3, FULL: 4 };

export const LEVEL_LABELS: Record<Exclude<AccessLevelName, "NONE">, string> = {
  VIEW: "يمكنه العرض",
  COMMENT: "يمكنه التعليق",
  EDIT: "يمكنه التعديل",
  FULL: "وصول كامل",
};

export function maxLevel(...levels: AccessLevelName[]): AccessLevelName {
  return levels.reduce<AccessLevelName>((a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a), "NONE");
}

export function atLeast(level: AccessLevelName, required: AccessLevelName): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}

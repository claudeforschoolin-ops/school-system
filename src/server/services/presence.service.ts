/**
 * الحضور اللحظي (من يشاهد/يعدّل الصفحة الآن) — في الذاكرة لنسخة خادم واحدة.
 * للنشر متعدد النسخ يُستبدل بمخزن Redis بنفس الواجهة.
 */
interface PresenceEntry {
  userId: string;
  name: string;
  avatarColor: string;
  at: number;
}

const STALE_MS = 30_000;
const rooms = new Map<string, Map<string, PresenceEntry>>();

export function heartbeat(tenantId: string, target: string, entry: Omit<PresenceEntry, "at">): PresenceEntry[] {
  const key = `${tenantId}:${target}`;
  const room = rooms.get(key) ?? new Map<string, PresenceEntry>();
  room.set(entry.userId, { ...entry, at: Date.now() });
  rooms.set(key, room);
  return listPresence(tenantId, target);
}

export function listPresence(tenantId: string, target: string): PresenceEntry[] {
  const key = `${tenantId}:${target}`;
  const room = rooms.get(key);
  if (!room) return [];
  const now = Date.now();
  for (const [id, e] of room) if (now - e.at > STALE_MS) room.delete(id);
  if (room.size === 0) rooms.delete(key);
  return [...room.values()];
}

export function leave(tenantId: string, target: string, userId: string): void {
  rooms.get(`${tenantId}:${target}`)?.delete(userId);
}

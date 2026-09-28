/**
 * الجلسة الحالية في مكونات الخادم (مخزنة لكل طلب).
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, validateSessionToken } from "./session";

export const getCurrentSession = cache(async () => {
  const store = await cookies();
  return validateSessionToken(store.get(SESSION_COOKIE)?.value);
});

"use client";
import { useState } from "react";

/**
 * حالة محلية قابلة للتحرير تبدأ من قيمة خارجية وتُعاد مزامنتها عند تغيّر تلك القيمة
 * (نمط React الموصى به: تعديل الحالة أثناء العرض بدلاً من useEffect).
 */
export function useSyncedState<T>(source: T) {
  const [value, setValue] = useState(source);
  const [synced, setSynced] = useState(source);
  if (!Object.is(synced, source)) {
    setSynced(source);
    setValue(source);
  }
  return [value, setValue] as const;
}

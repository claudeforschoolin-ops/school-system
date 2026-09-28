"use client";
import { useLayoutEffect, useRef } from "react";

/**
 * مرجع يحمل أحدث قيمة دائماً — لاستدعاءات المحرر والمؤقتات التي تُنشأ مرة واحدة.
 * يُحدَّث بعد العرض (لا أثناءه) ليبقى العرض نقياً.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * أنواع قواعد الأتمتة «عندما … فإن …» (مشتركة بين الواجهة والخادم).
 */
export type AutomationTrigger =
  | { type: "ROW_CREATED" }
  | { type: "PROPERTY_CHANGED"; propertyId: string; toValue?: unknown }
  | { type: "DATE_REACHED"; propertyId: string; offsetDays: number };

export type NotifyRecipients = "PERSON_PROPERTY" | "CREATOR" | "USERS";

export type AutomationAction =
  | { type: "SET_PROPERTY"; propertyId: string; value: unknown }
  | {
      type: "NOTIFY";
      recipients: NotifyRecipients;
      propertyId?: string;
      userIds?: string[];
      message: string;
    };

export const TRIGGER_LABELS: Record<AutomationTrigger["type"], string> = {
  ROW_CREATED: "عند إضافة سجل جديد",
  PROPERTY_CHANGED: "عند تغيّر خاصية",
  DATE_REACHED: "عند حلول تاريخ",
};

export const ACTION_LABELS: Record<AutomationAction["type"], string> = {
  SET_PROPERTY: "تعيين قيمة خاصية",
  NOTIFY: "إرسال إشعار",
};

/** قيم خاصة تُستبدل وقت التنفيذ */
export const SPECIAL_VALUES = {
  TODAY: "__today__",
  ACTOR: "__actor__",
} as const;

export function describeTrigger(trigger: AutomationTrigger, propName: (id: string) => string): string {
  switch (trigger.type) {
    case "ROW_CREATED":
      return "عند إضافة سجل جديد";
    case "PROPERTY_CHANGED":
      return `عندما تتغير «${propName(trigger.propertyId)}»`;
    case "DATE_REACHED":
      if (trigger.offsetDays === 0) return `عند حلول «${propName(trigger.propertyId)}»`;
      return trigger.offsetDays > 0
        ? `بعد «${propName(trigger.propertyId)}» بـ ${trigger.offsetDays} يوم`
        : `قبل «${propName(trigger.propertyId)}» بـ ${Math.abs(trigger.offsetDays)} يوم`;
  }
}

/**
 * نصوص رسائل أولياء الأمور الافتراضية (مشتركة بين الخادم وشاشة الإعدادات).
 */
export const DEFAULT_TEMPLATES = {
  admission_received: "استلمنا طلب التحاق {student} برقم {number}. سنتواصل معكم قريباً — {school}",
  admission_accepted: "يسعدنا إبلاغكم بقبول {student} في {grade}. الرقم الأكاديمي: {academicNumber}. أهلاً بكم في {school}",
  admission_rejected: "نعتذر عن عدم قبول طلب {student} لهذا العام. نشكر ثقتكم — {school}",
  admission_waitlist: "طلب {student} في قائمة الانتظار لـ{grade}، وسنبلغكم فور توفر مقعد — {school}",
  absence: "نفيدكم بغياب ابنكم/ابنتكم {student} اليوم {date}. للاستفسار: {schoolPhone} — {school}",
  late: "نفيدكم بتأخر {student} صباح اليوم {date} — {school}",
  absence_threshold: "تجاوز غياب {student} الحد المسموح ({count} أيام). نأمل مراجعة الوكيل — {school}",
  guardian_summon: "نأمل حضوركم إلى المدرسة بخصوص {student} يوم {date}. — {school}",
  leave_decision: "طلب {kind} لـ{student} ({date}): {decision} — {school}",
  transfer_completed: "تم تنفيذ طلب {kind} لـ{student}. رقم الشهادة: {certificate} — {school}",
  behavior_notice: "نفيدكم بتسجيل ملاحظة سلوكية على {student}: {category}. نأمل التواصل مع المدرسة عند الحاجة — {school}",
  activity_consent: "يرجى الموافقة على مشاركة {student} في «{activity}» بتاريخ {date} — {school}",
  invoice_issued: "صدرت فاتورة رقم {number} لـ{student} بمبلغ {amount}، تستحق في {dueDate} — {school}",
  receipt_issued: "استلمنا {amount} ({method}) بسند رقم {number}. الرصيد المتبقي: {balance}. شكراً لكم — {school}",
  reminder_before: "تذكير: يستحق قسط {student} بمبلغ {amount} في {dueDate} — {school}",
  reminder_due: "يستحق اليوم قسط {student} بمبلغ {amount}. نشكر مبادرتكم بالسداد — {school}",
  reminder_overdue: "نفيدكم بتأخر سداد {amount} لـ{student} منذ {days} يوماً. نأمل السداد أو التواصل مع المحاسبة — {school}",
  reminder_final: "إشعار أخير: مستحقات {student} المتأخرة {amount} منذ {days} يوماً. قد تُطبَّق سياسة المديونية — {school}",
  automation_notice: "{message} — {school}",
  document_to_sign: "لديكم {document} بانتظار التوقيع الإلكتروني من {school}. ادخلوا إلى حسابكم للاطلاع والتوقيع.",
} as const;
export type TemplateKey = keyof typeof DEFAULT_TEMPLATES;

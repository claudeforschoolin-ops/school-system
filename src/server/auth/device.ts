/** وصف عربي مختصر للجهاز من User-Agent (لقائمة الجلسات النشطة) */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return "جهاز غير معروف";
  const ua = userAgent;
  let browser = "متصفح";
  if (/Edg\//.test(ua)) browser = "إيدج";
  else if (/OPR\//.test(ua)) browser = "أوبرا";
  else if (/Chrome\//.test(ua)) browser = "كروم";
  else if (/Firefox\//.test(ua)) browser = "فايرفوكس";
  else if (/Safari\//.test(ua)) browser = "سفاري";
  let os = "";
  if (/iPhone|iPad/.test(ua)) os = "آيفون/آيباد";
  else if (/Android/.test(ua)) os = "أندرويد";
  else if (/Windows/.test(ua)) os = "ويندوز";
  else if (/Mac OS X/.test(ua)) os = "ماك";
  else if (/Linux/.test(ua)) os = "لينكس";
  return os ? `${browser} على ${os}` : browser;
}

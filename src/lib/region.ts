/**
 * الإقليم: المنصة دولية، وكل ما يختلف بين الدول (صيغة الهوية والجوال والآيبان والرقم الضريبي،
 * وأيام العطلة، وجنسية «المواطن») يُقرأ من إعدادات المدرسة. الدولة تملأ القيم الافتراضية،
 * وكل قيمة قابلة للتعديل من «الإعدادات ← المدرسة ← الدولة والإقليم».
 */

export interface RegionSettings {
  /** رمز الدولة ISO-3166 (جنسية المواطن) أو "INTL" لإعداد عام */
  country: string;
  citizenIdLabel: string;
  residentIdLabel: string;
  /** تعبير نمطي لرقم هوية المواطن بعد حذف المسافات (فارغ = أي أرقام/حروف ٥–٢٠) */
  citizenIdPattern: string;
  residentIdPattern: string;
  /** خانة تحقق لون (Luhn) على رقم الهوية */
  idLuhn: boolean;
  /** رمز الاتصال الدولي دون + */
  dialCode: string;
  /** صيغة الجوال المحلية بعد التطبيع (مثل ^05\d{8}$) — فارغ = أي رقم ٧–١٥ خانة */
  mobilePattern: string;
  /** البادئة المحلية التي تُضاف عند حذف رمز الدولة (مثل 0) */
  trunkPrefix: string;
  mobileHint: string;
  /** رمز دولة الآيبان المقبول (فارغ = أي دولة، أو لا آيبان) */
  ibanCountry: string;
  /** طول الآيبان الكامل لتلك الدولة (0 = أي طول صالح) */
  ibanLength: number;
  taxNumberLabel: string;
  /** صيغة الرقم الضريبي (فارغ = بلا تحقق) */
  taxNumberPattern: string;
  /** أيام العطلة الأسبوعية (٠=الأحد) */
  weekendDays: number[];
}

export interface CountryPreset extends RegionSettings {
  name: string;
  currency: string;
  timezone: string;
}

const base = {
  idLuhn: false,
  trunkPrefix: "0",
  ibanLength: 0,
  taxNumberPattern: "",
  taxNumberLabel: "الرقم الضريبي",
  weekendDays: [5, 6],
};

export const COUNTRY_PRESETS: Record<string, CountryPreset> = {
  SA: { ...base, country: "SA", name: "السعودية", currency: "SAR", timezone: "Asia/Riyadh", citizenIdLabel: "هوية وطنية", residentIdLabel: "إقامة", citizenIdPattern: "^1\\d{9}$", residentIdPattern: "^2\\d{9}$", idLuhn: true, dialCode: "966", mobilePattern: "^05\\d{8}$", mobileHint: "05xxxxxxxx", ibanCountry: "SA", ibanLength: 24, taxNumberPattern: "^3\\d{13}3$", taxNumberLabel: "الرقم الضريبي (١٥ رقماً)" },
  AE: { ...base, country: "AE", name: "الإمارات", currency: "AED", timezone: "Asia/Dubai", weekendDays: [0, 6], citizenIdLabel: "هوية إماراتية", residentIdLabel: "هوية إماراتية (مقيم)", citizenIdPattern: "^784\\d{12}$", residentIdPattern: "^784\\d{12}$", dialCode: "971", mobilePattern: "^05\\d{8}$", mobileHint: "05xxxxxxxx", ibanCountry: "AE", ibanLength: 23, taxNumberPattern: "^\\d{15}$", taxNumberLabel: "رقم التسجيل الضريبي TRN" },
  KW: { ...base, country: "KW", name: "الكويت", currency: "KWD", timezone: "Asia/Kuwait", citizenIdLabel: "بطاقة مدنية", residentIdLabel: "بطاقة مدنية (مقيم)", citizenIdPattern: "^\\d{12}$", residentIdPattern: "^\\d{12}$", dialCode: "965", mobilePattern: "^[569]\\d{7}$", trunkPrefix: "", mobileHint: "5xxxxxxx", ibanCountry: "KW", ibanLength: 30 },
  QA: { ...base, country: "QA", name: "قطر", currency: "QAR", timezone: "Asia/Qatar", citizenIdLabel: "بطاقة شخصية", residentIdLabel: "بطاقة إقامة", citizenIdPattern: "^\\d{11}$", residentIdPattern: "^\\d{11}$", dialCode: "974", mobilePattern: "^[3567]\\d{7}$", trunkPrefix: "", mobileHint: "3xxxxxxx", ibanCountry: "QA", ibanLength: 29 },
  BH: { ...base, country: "BH", name: "البحرين", currency: "BHD", timezone: "Asia/Bahrain", citizenIdLabel: "بطاقة هوية", residentIdLabel: "بطاقة هوية (مقيم)", citizenIdPattern: "^\\d{9}$", residentIdPattern: "^\\d{9}$", dialCode: "973", mobilePattern: "^[36]\\d{7}$", trunkPrefix: "", mobileHint: "3xxxxxxx", ibanCountry: "BH", ibanLength: 22 },
  OM: { ...base, country: "OM", name: "عُمان", currency: "OMR", timezone: "Asia/Muscat", citizenIdLabel: "بطاقة مدنية", residentIdLabel: "بطاقة مقيم", citizenIdPattern: "^\\d{6,10}$", residentIdPattern: "^\\d{6,10}$", dialCode: "968", mobilePattern: "^[79]\\d{7}$", trunkPrefix: "", mobileHint: "9xxxxxxx", ibanCountry: "OM", ibanLength: 23 },
  EG: { ...base, country: "EG", name: "مصر", currency: "EGP", timezone: "Africa/Cairo", citizenIdLabel: "رقم قومي", residentIdLabel: "إقامة", citizenIdPattern: "^[23]\\d{13}$", residentIdPattern: "", dialCode: "20", mobilePattern: "^01[0125]\\d{8}$", mobileHint: "01xxxxxxxxx", ibanCountry: "EG", ibanLength: 29, weekendDays: [5, 6] },
  JO: { ...base, country: "JO", name: "الأردن", currency: "JOD", timezone: "Asia/Amman", citizenIdLabel: "رقم وطني", residentIdLabel: "إقامة", citizenIdPattern: "^\\d{10}$", residentIdPattern: "", dialCode: "962", mobilePattern: "^07[789]\\d{7}$", mobileHint: "07xxxxxxxx", ibanCountry: "JO", ibanLength: 30 },
  INTL: { ...base, country: "INTL", name: "دولي / أخرى", currency: "USD", timezone: "UTC", weekendDays: [0, 6], citizenIdLabel: "هوية وطنية", residentIdLabel: "تصريح إقامة", citizenIdPattern: "", residentIdPattern: "", dialCode: "", mobilePattern: "", trunkPrefix: "", mobileHint: "رقم دولي بصيغة +", ibanCountry: "", ibanLength: 0 },
};

export const COUNTRY_OPTIONS = Object.values(COUNTRY_PRESETS).map((c) => ({ value: c.country, label: c.name }));

export function presetRegion(country: string): RegionSettings {
  const { name: _n, currency: _c, timezone: _t, ...r } = COUNTRY_PRESETS[country] ?? COUNTRY_PRESETS.INTL!;
  return r;
}

/** إعدادات الإقليم من إعدادات المدرسة (الافتراضي: السعودية للتوافق مع البيانات القائمة) */
export function readRegion(tenantSettings: unknown): RegionSettings {
  const raw = ((tenantSettings ?? {}) as Record<string, unknown>).region as Partial<RegionSettings> | undefined;
  return { ...presetRegion(raw?.country ?? "SA"), ...(raw ?? {}) };
}

/** هل الجنسية جنسية دولة المدرسة (للتأمينات والإعفاء الضريبي وتسمية الهوية) */
export const isCitizen = (nationality: string | null | undefined, region: Pick<RegionSettings, "country">) => Boolean(nationality) && nationality === region.country;

export function normalizeDigits(raw: string): string {
  return raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\s|-/g, "");
}

const safeRegex = (p: string) => {
  try {
    return p ? new RegExp(p) : null;
  } catch {
    return null;
  }
};

export function luhnValid(digits: string) {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  // خوارزمية الهوية السعودية: مضاعفة الخانات الفردية من اليسار
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[i]);
    if (i % 2 === (digits.length % 2 === 0 ? 0 : 1)) {
      const x = d * 2;
      sum += Math.floor(x / 10) + (x % 10);
    } else sum += d;
  }
  return sum % 10 === 0;
}

export type IdType = "NATIONAL_ID" | "IQAMA" | "PASSPORT";

export function idTypeLabel(type: IdType | string, region: Pick<RegionSettings, "citizenIdLabel" | "residentIdLabel">) {
  return type === "PASSPORT" ? "جواز سفر" : type === "IQAMA" ? region.residentIdLabel : region.citizenIdLabel;
}

/** التحقق من رقم الهوية حسب نوعها وصيغ الدولة */
export function validateIdNumber(type: IdType, raw: string, region: RegionSettings): string | null {
  const id = normalizeDigits(raw);
  if (type === "PASSPORT") return /^[A-Z0-9]{6,12}$/i.test(id) ? null : "رقم الجواز غير صالح";
  const label = idTypeLabel(type, region);
  const re = safeRegex(type === "NATIONAL_ID" ? region.citizenIdPattern : region.residentIdPattern);
  if (re ? !re.test(id) : !/^[A-Z0-9]{5,20}$/i.test(id)) return `رقم ${label} غير صالح`;
  if (region.idLuhn && !luhnValid(id)) return `رقم ${label} غير صالح (خانة التحقق)`;
  return null;
}

/** تطبيع الجوال إلى الصيغة المحلية (أو دولية + لإعداد عام)؛ null إن كان غير صالح */
export function normalizeMobile(raw: string, region: RegionSettings): string | null {
  let d = normalizeDigits(raw).replace(/[()]/g, "");
  const intl = d.startsWith("+") || d.startsWith("00");
  d = d.replace(/^\+|^00/, "");
  if (!/^\d+$/.test(d)) return null;
  const re = safeRegex(region.mobilePattern);
  if (!re) return d.length >= 7 && d.length <= 15 ? (intl ? `+${d}` : d) : null;
  if (region.dialCode && d.startsWith(region.dialCode) && (intl || d.length > 10)) d = region.trunkPrefix + d.slice(region.dialCode.length);
  else if (region.trunkPrefix && !d.startsWith(region.trunkPrefix)) d = region.trunkPrefix + d;
  return re.test(d) ? d : null;
}

/** آيبان صالح (MOD-97) ومطابق لدولة الإعداد إن حُددت */
export function validIban(raw: string, region?: Pick<RegionSettings, "ibanCountry" | "ibanLength">) {
  const s = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  if (region?.ibanCountry && !s.startsWith(region.ibanCountry)) return false;
  if (region?.ibanLength && s.length !== region.ibanLength) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

export function ibanHint(region: Pick<RegionSettings, "ibanCountry" | "ibanLength">) {
  return region.ibanCountry ? `آيبان يبدأ بـ ${region.ibanCountry}${region.ibanLength ? ` (${region.ibanLength} خانة)` : ""}` : "آيبان دولي صالح";
}

export function validTaxNumber(raw: string, region: Pick<RegionSettings, "taxNumberPattern">) {
  if (!raw) return true;
  const re = safeRegex(region.taxNumberPattern);
  return re ? re.test(normalizeDigits(raw)) : true;
}

/** الجنسيات (صفة عربية) — تشمل كل دول الإعداد المسبق وجنسيات الوافدين الشائعة */
export const NATIONALITIES: Array<{ id: string; name: string; color: "green" | "gold" | "navy" | "teal" | "brown" | "orange" | "slate" | "purple" | "gray" | "red" }> = [
  { id: "SA", name: "سعودي", color: "green" },
  { id: "AE", name: "إماراتي", color: "green" },
  { id: "KW", name: "كويتي", color: "green" },
  { id: "QA", name: "قطري", color: "green" },
  { id: "BH", name: "بحريني", color: "green" },
  { id: "OM", name: "عُماني", color: "green" },
  { id: "EG", name: "مصري", color: "gold" },
  { id: "JO", name: "أردني", color: "navy" },
  { id: "SY", name: "سوري", color: "teal" },
  { id: "LB", name: "لبناني", color: "teal" },
  { id: "PS", name: "فلسطيني", color: "navy" },
  { id: "IQ", name: "عراقي", color: "brown" },
  { id: "YE", name: "يمني", color: "brown" },
  { id: "SD", name: "سوداني", color: "orange" },
  { id: "MA", name: "مغربي", color: "red" },
  { id: "TN", name: "تونسي", color: "red" },
  { id: "DZ", name: "جزائري", color: "red" },
  { id: "PK", name: "باكستاني", color: "slate" },
  { id: "IN", name: "هندي", color: "purple" },
  { id: "PH", name: "فلبيني", color: "slate" },
  { id: "GB", name: "بريطاني", color: "navy" },
  { id: "US", name: "أمريكي", color: "navy" },
  { id: "OTHER", name: "أخرى", color: "gray" },
];
export const nationalityName = (c: string) => NATIONALITIES.find((n) => n.id === c)?.name ?? c;

/** نوع الهوية المرجح من الرقم وصيغ الدولة (للأرقام المدخلة دون تحديد النوع) */
export function guessIdType(raw: string, region: RegionSettings): IdType {
  const id = normalizeDigits(raw);
  const citizen = safeRegex(region.citizenIdPattern);
  const resident = safeRegex(region.residentIdPattern);
  if (resident?.test(id) && !citizen?.test(id)) return "IQAMA";
  return "NATIONAL_ID";
}

/** خيارات نوع الهوية بتسميات الدولة */
export const idTypeOptions = (region: RegionSettings) => (["NATIONAL_ID", "IQAMA", "PASSPORT"] as const).map((t) => ({ value: t, label: idTypeLabel(t, region) }));

import { describe, expect, it } from "vitest";
import { ageAt, composeFullName, normalizeDigits, splitFullName, validateIdNumber } from "@/lib/students";
import { luhnValid, normalizeMobile, presetRegion, readRegion, validIban, validTaxNumber } from "@/lib/region";
import { fakeNationalId } from "../fake-id";

const SA = presetRegion("SA");
const AE = presetRegion("AE");
const EG = presetRegion("EG");
const INTL = presetRegion("INTL");
const isValidSaudiId = (id: string) => /^[12]\d{9}$/.test(id) && luhnValid(id);

describe("رقم الهوية الوطنية/الإقامة", () => {
  it("يقبل الأرقام ذات خانة التحقق الصحيحة (خوارزمية لون)", () => {
    for (const seed of [1, 42, 424242, 987654]) expect(isValidSaudiId(fakeNationalId(seed))).toBe(true);
  });

  it("يرفض الرقم إذا تغيّرت خانة واحدة", () => {
    const id = fakeNationalId(1234);
    const last = Number(id[9]);
    expect(isValidSaudiId(`${id.slice(0, 9)}${(last + 1) % 10}`)).toBe(false);
  });

  it("يقبل الأرقام العربية والمسافات والشرطات", () => {
    const id = fakeNationalId(77);
    const arabic = id.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]!);
    expect(normalizeDigits(`${arabic.slice(0, 4)} ${arabic.slice(4)}`)).toBe(id);
    expect(validateIdNumber("NATIONAL_ID", arabic, SA)).toBeNull();
  });

  it("يميّز الهوية الوطنية (١) عن الإقامة (٢)", () => {
    const national = fakeNationalId(5);
    expect(validateIdNumber("IQAMA", national, SA)).toContain("إقامة");
    expect(validateIdNumber("NATIONAL_ID", "123", SA)).toBe("رقم هوية وطنية غير صالح");
    expect(validateIdNumber("PASSPORT", "A1234567", SA)).toBeNull();
  });
});

describe("الإقليم: المنصة دولية وكل صيغة من إعدادات الدولة", () => {
  it("الجوال حسب الدولة", () => {
    expect(normalizeMobile("+971501234567", AE)).toBe("0501234567");
    expect(normalizeMobile("01012345678", EG)).toBe("01012345678");
    expect(normalizeMobile("+201012345678", EG)).toBe("01012345678");
    expect(normalizeMobile("0551234567", EG)).toBeNull();
    expect(normalizeMobile("+44 7700 900123", INTL)).toBe("+447700900123");
  });

  it("الهوية حسب الدولة، والنمط المخصص من الإعدادات يغلب الافتراضي", () => {
    expect(validateIdNumber("NATIONAL_ID", "784198712345678", AE)).toBeNull();
    expect(validateIdNumber("NATIONAL_ID", "29001011234567", EG)).toBeNull();
    expect(validateIdNumber("NATIONAL_ID", "12345", EG)).toContain("رقم قومي");
    expect(validateIdNumber("NATIONAL_ID", "AB12345", INTL)).toBeNull();
    const custom = readRegion({ region: { country: "EG", citizenIdPattern: "^\\d{5}$" } });
    expect(validateIdNumber("NATIONAL_ID", "12345", custom)).toBeNull();
  });

  it("الآيبان: MOD-97 ودولة الإعداد", () => {
    expect(validIban("SA0380000000608010167519", SA)).toBe(true);
    expect(validIban("SA0380000000608010167518", SA)).toBe(false);
    expect(validIban("GB82WEST12345698765432", SA)).toBe(false);
    expect(validIban("GB82WEST12345698765432", INTL)).toBe(true);
    expect(validIban("AE070331234567890123456", AE)).toBe(true);
  });

  it("الرقم الضريبي حسب صيغة الدولة", () => {
    expect(validTaxNumber("300000000000003", SA)).toBe(true);
    expect(validTaxNumber("123", SA)).toBe(false);
    expect(validTaxNumber("anything", INTL)).toBe(true);
  });
});

describe("بيانات الطالب", () => {
  it("الجوال السعودي بصيغه المختلفة (إعداد السعودية)", () => {
    expect(normalizeMobile("0551234567", SA)).toBe("0551234567");
    expect(normalizeMobile("+966551234567", SA)).toBe("0551234567");
    expect(normalizeMobile("٠٥٥١٢٣٤٥٦٧", SA)).toBe("0551234567");
    expect(normalizeMobile("0112345678", SA)).toBeNull();
  });

  it("الاسم الرباعي تركيباً وتقسيماً", () => {
    expect(composeFullName({ firstName: "سعد", fatherName: "فهد", grandfatherName: "علي", familyName: "الحربي" })).toBe("سعد فهد علي الحربي");
    expect(splitFullName("عبدالله بن محمد بن سعد آل سعود")).toEqual({ firstName: "عبدالله", fatherName: "بن", grandfatherName: "محمد بن سعد آل", familyName: "سعود" });
    expect(splitFullName("نورة سعد العتيبي")).toEqual({ firstName: "نورة", fatherName: "سعد", grandfatherName: "", familyName: "العتيبي" });
  });

  it("العمر عند تاريخ مرجعي", () => {
    expect(ageAt("2019-09-29", new Date("2026-09-28"))).toBe(6);
    expect(ageAt("2019-09-28", new Date("2026-09-28"))).toBe(7);
  });
});

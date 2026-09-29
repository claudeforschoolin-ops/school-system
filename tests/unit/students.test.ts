import { describe, expect, it } from "vitest";
import { ageAt, composeFullName, isValidSaudiId, normalizeDigits, normalizeSaudiMobile, splitFullName, validateIdNumber } from "@/lib/students";
import { fakeNationalId } from "../fake-id";

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
    expect(validateIdNumber("NATIONAL_ID", arabic)).toBeNull();
  });

  it("يميّز الهوية الوطنية (١) عن الإقامة (٢)", () => {
    const national = fakeNationalId(5);
    expect(validateIdNumber("IQAMA", national)).toContain("الإقامة");
    expect(validateIdNumber("NATIONAL_ID", "123")).toBe("رقم الهوية غير صالح");
    expect(validateIdNumber("PASSPORT", "A1234567")).toBeNull();
  });
});

describe("بيانات الطالب", () => {
  it("الجوال السعودي بصيغه المختلفة", () => {
    expect(normalizeSaudiMobile("0551234567")).toBe("0551234567");
    expect(normalizeSaudiMobile("+966551234567")).toBe("0551234567");
    expect(normalizeSaudiMobile("٠٥٥١٢٣٤٥٦٧")).toBe("0551234567");
    expect(normalizeSaudiMobile("0112345678")).toBeNull();
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

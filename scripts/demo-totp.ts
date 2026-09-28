/**
 * يطبع رمز المصادقة الثنائية الحالي للحسابات التجريبية (للعرض فقط).
 * الاستخدام: npm run demo:totp
 */
import { totp } from "../src/server/auth/totp";
import { DEMO_TOTP_SECRET } from "../prisma/seed/data/people";

const code = totp(DEMO_TOTP_SECRET);
const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
console.log(`رمز التحقق الحالي للحسابات التجريبية: ${code} (صالح ${remaining} ثانية)`);

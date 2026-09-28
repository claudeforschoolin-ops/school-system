/**
 * لقطات شاشة للواجهة عبر Playwright (للتوثيق والمراجعة البصرية).
 * الاستخدام: npm run screens -- <email> <path> [<path>...] [--dark] [--mobile] [--out dir]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { totp } from "../src/server/auth/totp";
import { DEMO_TOTP_SECRET } from "../prisma/seed/data/people";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]?.startsWith("--") && ["--out", "--wait", "--width"].includes(args[i - 1]!)));
const [email = "principal@demo.manassa.sa", ...paths] = positional;
const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = opt("--out") ?? "docs/screenshots";
const wait = Number(opt("--wait") ?? 1200);
mkdirSync(out, { recursive: true });

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
  const width = Number(opt("--width") ?? (flag("--mobile") ? 390 : 1440));
  const context = await browser.newContext({
    viewport: { width, height: flag("--mobile") ? 844 : 900 },
    locale: "ar-SA",
    timezoneId: "Asia/Riyadh",
    colorScheme: flag("--dark") ? "dark" : "light",
    deviceScaleFactor: 1,
  });
  if (flag("--dark")) await context.addCookies([{ name: "manassa_theme", value: "dark", url: base }]);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("[console]", m.text()));
  await page.goto(`${base}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "Manassa@2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(home|two-factor|setup-2fa)/, { timeout: 30000 });
  if (page.url().includes("two-factor")) {
    await page.fill('input[autocomplete="one-time-code"]', totp(DEMO_TOTP_SECRET));
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/home/, { timeout: 30000 });
  }
  for (const p of paths.length ? paths : ["/home"]) {
    await page.goto(`${base}${p}`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(wait);
    const name = `${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root"}${flag("--dark") ? "-dark" : ""}${flag("--mobile") ? "-mobile" : ""}.png`;
    await page.screenshot({ path: `${out}/${name}`, fullPage: flag("--full") });
    console.log(`📸 ${out}/${name}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { Lockup } from "@/components/brand/mark";
import { MobileNav } from "@/components/mobile-nav";
import { dossierHref, nav } from "@/content/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper">
      <div className="wrap flex h-[4.5rem] items-center justify-between gap-6">
        <a href="#top" aria-label="Sanad, back to top" className="text-ink">
          <Lockup size={32 / 0.9} className="max-sm:text-[1.7rem]" />
        </a>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="text-caption flex items-center gap-9 text-ink-3">
            {nav.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="nav-link transition-colors hover:text-ink">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={dossierHref}
            className="btn btn-line hidden !py-2 md:inline-flex"
          >
            Request Technical Dossier
          </a>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}

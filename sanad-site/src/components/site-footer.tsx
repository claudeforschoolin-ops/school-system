import { Lockup } from "@/components/brand/mark";
import { footer, site } from "@/content/site";

export function SiteFooter() {
  return (
    <footer className="on-ink bg-ink text-paper">
      <div className="wrap grid gap-12 py-16 md:grid-cols-2 md:gap-x-10 lg:grid-cols-12 lg:gap-8 lg:py-20">
        <div className="md:col-span-2 lg:col-span-4">
          <Lockup size={30} tone="ink" className="text-paper" />
          <p className="text-caption mt-6 text-paper/60">© {new Date().getFullYear()} {site.name}. All rights reserved.</p>
          <p className="text-caption mt-3 flex items-center gap-2 text-paper/80">
            <span aria-hidden="true" className="inline-block size-2 rounded-full bg-mist" />
            {site.status} · {site.location}
          </p>
        </div>

        <nav aria-label="Documentation" className="lg:col-span-4">
          <h2 className="text-caption font-medium text-mist">Documentation</h2>
          <ul className="mt-4 space-y-3">
            {footer.docs.map((d) => (
              <li key={d.label}>
                <a href={d.href} className="text-body text-paper underline decoration-paper/25 underline-offset-4 transition-colors hover:decoration-paper">
                  {d.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-caption mt-5 text-paper/55">Shared on request, with the technical dossier.</p>
        </nav>

        <div className="lg:col-span-4">
          <h2 className="text-caption font-medium text-mist">Inquiries</h2>
          <a
            href={`mailto:${site.email}`}
            className="text-title mt-4 inline-block text-paper underline decoration-paper/25 underline-offset-[6px] transition-colors hover:decoration-paper"
          >
            {site.email}
          </a>
          <p className="text-body mt-4 max-w-[22rem] text-paper/75">
            For an architectural walkthrough of any system on this page,{" "}
            <a href={footer.walkthroughHref} className="text-paper underline decoration-paper/25 underline-offset-4 hover:decoration-paper">
              write to us directly
            </a>
            .
          </p>
        </div>
      </div>

      <div className="border-t border-paper/15">
        <div className="wrap py-6">
          <p className="font-serif text-[1.0625rem] italic text-paper/80">{site.tagline}</p>
        </div>
      </div>
    </footer>
  );
}

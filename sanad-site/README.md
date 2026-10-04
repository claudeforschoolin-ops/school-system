# Sanad — informational website

An editorial, typography-first site for Sanad, an enterprise engineering studio.
Standalone Next.js project: it shares no code, styles or configuration with anything
else in this repository.

```bash
cd sanad-site
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run lint && npm run typecheck
```

## Where things live

| Path | What |
| --- | --- |
| `src/content/site.ts` | All copy, nav, footer links, contact email, studio status. Edit wording here. |
| `src/app/globals.css` | Design tokens (Paper, Ink, Mist, Sanad blue), type scale, lockup, loop line. |
| `src/components/brand/` | The symbol (traced from the brand guidelines) and the primary lockup. |
| `src/components/hero-schematic.tsx` | The 2D data-routing schematic in the hero. |
| `src/components/wireframes.tsx` | Interface wireframes for the three turnkey modules. |

## Brand rules the code follows

- **Palette:** Paper `#F7F6F2`, Ink `#161616`, Mist `#C5D1EB`, Sanad blue `#2F4B8F`. Values were sampled from the guideline artwork.
- **Type:** Newsreader (display, headings, wordmark), Hanken Grotesk (interface and body), JetBrains Mono (schemas, metrics). Scale: display 64, heading 36, title 22, body 17, caption 14. Display and heading step down on small screens.
- **Lockup:** symbol is 90% of the wordmark size, gap is one fifth, capital height centred on the symbol, wordmark in Semibold with +0.01em tracking. Size a lockup with `font-size` only.
- **Line and wash:** one ink line with round ends, a Mist wash shifted down and right. No gradients, no shadows. The loop line is a divider and a quiet background.
- **Geometry:** 1px hairlines, 6–10px radii, no pill buttons.

Fonts are self-hosted through `@fontsource-variable`, so there are no runtime requests to third parties.

## Placeholders to confirm

- `site.location` and `site.status` in `src/content/site.ts` (footer status line).
- Documentation, whitepaper and blueprint links point at `mailto:` requests until those documents are published.
- The event trace, wireframe values and schemas are illustrative, and labelled as such on the page.

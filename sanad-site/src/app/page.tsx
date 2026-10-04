import { Hero } from "@/components/hero";
import { Law } from "@/components/law";
import { Manifesto } from "@/components/manifesto";
import { Mechanics } from "@/components/mechanics";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Systems } from "@/components/systems";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero />
        <Law />
        <Systems />
        <Mechanics />
        <Manifesto />
      </main>
      <SiteFooter />
    </>
  );
}

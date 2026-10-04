import { CtaBand } from "@/components/cta-band";
import { Faq } from "@/components/faq";
import { Hero } from "@/components/hero";
import { HowWeWork } from "@/components/how-we-work";
import { Law } from "@/components/law";
import { Manifesto } from "@/components/manifesto";
import { Mechanics } from "@/components/mechanics";
import { Models } from "@/components/models";
import { Security } from "@/components/security";
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
        <Security />
        <HowWeWork />
        <Models />
        <Faq />
        <Manifesto />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}

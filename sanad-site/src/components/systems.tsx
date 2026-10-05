import { ModuleConfigurator } from "@/components/module-configurator";
import { PillarB } from "@/components/pillar-b";
import { SectionHead } from "@/components/section-head";
import { systems } from "@/content/site";

export function Systems() {
  return (
    <section id="systems" data-section data-n="02" data-label="Systems" aria-labelledby="systems-title" className="py-20 lg:py-28">
      <div className="wrap">
        <SectionHead index={systems.index} label={systems.label} heading={systems.heading} lead={systems.lead} id="systems-title" />

        <div className="mt-14 space-y-20 lg:mt-16 lg:space-y-28">
          <ModuleConfigurator />
          <PillarB />
        </div>
      </div>
    </section>
  );
}

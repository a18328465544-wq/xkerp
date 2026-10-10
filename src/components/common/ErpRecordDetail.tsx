import type {ReactNode} from "react";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {ErpDetailFact, ErpDetailFactGrid, type ErpDetailFactProps} from "./ErpDetailFact";

export interface ErpRecordFact {
  label: string;
  value: ReactNode;
  tone?: ErpDetailFactProps["tone"];
}

export interface ErpRecordSection {
  title: string;
  /** Falsy entries are skipped, so permission-gated facts can be written inline. */
  facts: ReadonlyArray<ErpRecordFact | false | null | undefined | "" | 0>;
  /** Secondary information folds behind a disclosure on phones. */
  collapsed?: boolean;
  /** Non-fact content such as tag lists, shown after the facts. */
  extra?: ReactNode;
}

export interface ErpRecordDetailProps {
  /** `titleLabel` turns the phone identity title into the first desktop fact, for drawers whose own title is a document number. */
  hero: {title: string; titleLabel?: string; status?: ReactNode; thumbnail?: ReactNode; amount?: {label: string; value: ReactNode}; facts?: ReadonlyArray<ErpRecordFact | false | null | undefined | "" | 0>};
  sections: readonly ErpRecordSection[];
  /** @internal 仅测试用 */
  phone?: boolean;
}

/**
 * Detail content template (MOBILE_UI_RULES M16): identity → facts → folded
 * extras. Phones get a single-column document; desktop drawers keep the
 * two-column fact grid. Place it inside ErpDetailDrawer.
 */
export function ErpRecordDetail({hero, sections, phone: phoneProp}: ErpRecordDetailProps) {
  const phoneFromHook = useErpPhone();
  const phone = phoneProp ?? phoneFromHook;
  const visible = sections
    .map((section) => ({...section, facts: section.facts.filter((fact): fact is ErpRecordFact => Boolean(fact))}))
    .filter((section) => section.facts.length > 0 || section.extra);
  const heroFacts = (hero.facts ?? []).filter((fact): fact is ErpRecordFact => Boolean(fact));
  const facts = (items: ErpRecordFact[]) => items.map((fact) => <ErpDetailFact key={fact.label} label={fact.label} value={fact.value} tone={fact.tone} />);

  if (phone) return <div className="erp-phone-document" data-phone-detail="document">
    <section data-erp-region="detail-hero">
      <div className="erp-record-identity">{hero.thumbnail}<div><h2>{hero.title}</h2>{hero.status}</div></div>
      {hero.amount && <div className="erp-detail-hero-amount"><span>{hero.amount.label}</span><strong className="erp-data-number">{hero.amount.value}</strong></div>}
      {facts(heroFacts)}
    </section>
    {visible.map((section) => section.collapsed
      ? <details key={section.title}><summary>{section.title}</summary>{facts(section.facts)}{section.extra}</details>
      : <section key={section.title}><h2>{section.title}</h2>{facts(section.facts)}{section.extra}</section>)}
  </div>;

  const heroFact: ErpRecordFact[] = [
    ...(hero.titleLabel ? [{label: hero.titleLabel, value: hero.title}] : []),
    ...(hero.amount ? [{label: hero.amount.label, value: hero.amount.value}] : []),
  ];
  return <div className="space-y-5" data-record-detail="desktop">
    {hero.status && <div className="flex flex-wrap items-center gap-2">{hero.status}</div>}
    {/* One grid on desktop; a fact repeated for the phone hero shows once. */}
    <ErpDetailFactGrid>{facts([...heroFact, ...heroFacts, ...visible.flatMap((section) => section.facts)].filter((fact, index, all) => all.findIndex((other) => other.label === fact.label) === index))}</ErpDetailFactGrid>
    {/* A section that is only a table or list keeps its title on desktop too. */}
    {visible.map((section) => section.extra ? <div key={section.title}>{section.facts.length === 0 && <h3 className="mb-3 text-sm font-semibold">{section.title}</h3>}{section.extra}</div> : null)}
  </div>;
}

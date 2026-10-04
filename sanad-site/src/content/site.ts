/**
 * All copy and configuration for the Sanad site lives here, so wording can be
 * edited without touching layout code.
 */

export const site = {
  name: "Sanad",
  email: "inquiries@sanad.systems",
  tagline: "Support for the people who lead.",
  /** Shown in the footer status line. Edit to match the studio. */
  location: "Remote-first studio",
  status: "Accepting new engagements",
} as const;

/** mailto links keep every request a plain, direct message. No forms, no popups. */
export function mailto(subject: string, body?: string) {
  const q = new URLSearchParams({ subject });
  if (body) q.set("body", body);
  // URLSearchParams encodes spaces as "+", which mail clients show literally.
  return `mailto:${site.email}?${q.toString().replace(/\+/g, "%20")}`;
}

export const dossierHref = mailto(
  "Technical dossier request",
  "Hello Sanad,\n\nPlease send the technical dossier.\n\nCompany:\nRole:\nSystems in scope:\n",
);

export const nav = [
  { label: "Architecture", href: "#architecture" },
  { label: "Systems", href: "#systems" },
  { label: "The 30% Law", href: "#thirty-percent-law" },
  { label: "Company", href: "#company" },
] as const;

export const hero = {
  headline: "Intelligent systems built to quietly run commerce.",
  sub: "Sanad constructs operational backbones and bespoke autonomous logic for commercial enterprises. We remove the cognitive and administrative weight of scaling — engineering a structural reduction of at least 30% in daily operational load.",
  perspectives: [
    {
      label: "For Leadership",
      text: "Predictable velocity, margin protection, and operational clarity.",
    },
    {
      label: "For Engineering",
      text: "Decoupled architecture, local-first integrity, and zero black-box dependencies.",
    },
  ],
} as const;

export const law = {
  index: "01",
  label: "Proof by metric",
  heading: "The 30% efficiency baseline",
  lead: "Operational load is not a feeling. It is waiting, re-keying and reconciling — three things that can be measured, and removed. Every system we build is specified against one baseline: a structural reduction of at least 30% in daily operational load.",
  rows: [
    {
      workstream: "Inventory & Supply Sync",
      before: { value: "18 hours", note: "of multi-channel lag between stock and sales" },
      after: { value: "Sub-second", note: "synchronization across every channel" },
    },
    {
      workstream: "Financial & Reconciled Auditing",
      before: { value: "Repeated", note: "reconciliations, performed by staff each cycle" },
      after: { value: "Zero-loss", note: "balancing routines, automated end to end" },
    },
    {
      workstream: "Human Error Overhead",
      before: { value: "Re-keyed", note: "data entered again in each system it touches" },
      after: { value: "Eliminated", note: "structurally: one entry, one record of truth" },
    },
  ],
  definition: {
    caption: "Definition",
    lines: [
      { code: "L  = t_wait + t_rekey + t_reconcile", note: "daily operational load, in hours" },
      { code: "L′ ≤ 0.70 × L", note: "the 30% Law" },
    ],
  },
  bars: {
    caption: "Daily operational load, indexed",
    baseline: { label: "Baseline", value: 100 },
    sanad: { label: "With Sanad", value: 70, note: "≤ 70" },
    reclaimed: "At least 30% reclaimed",
  },
} as const;

export type ModuleId = "inventory" | "units" | "ledger";

export type ModuleSpec = {
  id: ModuleId;
  name: string;
  summary: string;
  /** What the module is the system of record for. */
  owns: string;
  /** The two data streams that feed it. */
  sources: readonly [string, string];
  schemaTitle: string;
  schema: ReadonlyArray<readonly [name: string, type: string, note?: string]>;
  invariant?: string;
  params: ReadonlyArray<readonly [key: string, value: string]>;
};

export const systems = {
  index: "02",
  label: "Systems & architecture",
  heading: "Ready-made modules. Bespoke engineering.",
  lead: "Two explicit offerings, never blended. Pillar A is production-tested software, configured for your business. Pillar B is engineered from scratch, for operational flows that belong to you alone.",
  pillarA: {
    letter: "A",
    title: "Turnkey Intelligent Modules",
    kind: "Pre-configured SaaS",
    text: "High-efficiency, production-tested systems, ready for deployment.",
    modules: [
      {
        id: "inventory",
        name: "Inventory & Distributed Warehousing Logic",
        summary: "One stock position across every warehouse, store and channel.",
        owns: "Stock position per node, reservations and transfers.",
        sources: ["Warehouse scanners", "3PL & logistics"],
        schemaTitle: "StockLevel",
        schema: [
          ["sku", "string"],
          ["node", "NodeId", "warehouse or store"],
          ["on_hand", "int"],
          ["reserved", "int", "held for open orders"],
          ["version", "lamport", "deterministic ordering"],
        ],
        params: [
          ["Topology", "n-node, multi-warehouse"],
          ["Sync", "event-sourced, deterministic merge"],
          ["Reservations", "per-channel holds, auto-expiry"],
          ["Offline", "node-local ledger, reconcile on reconnect"],
          ["Latency", "< 100 ms in-site, sub-second across channels"],
        ],
      },
      {
        id: "units",
        name: "Hospitality & Unit Management Engines",
        summary: "Units, stays and turnover, held to a single source of availability.",
        owns: "Units, stays, availability and turnover tasks.",
        sources: ["Booking channels", "Property systems"],
        schemaTitle: "Stay",
        schema: [
          ["unit", "UnitId"],
          ["from", "date"],
          ["to", "date"],
          ["status", "vacant | occupied | turnover | blocked"],
          ["rate_plan", "RatePlanId"],
        ],
        invariant: "no two stays overlap on one unit",
        params: [
          ["Allocation", "overlap-free by construction"],
          ["Housekeeping", "status transitions create tasks"],
          ["Channels", "booking channels kept in step"],
          ["Rates", "plans, seasons and restrictions"],
          ["Handover", "turnover opens at check-out"],
        ],
      },
      {
        id: "ledger",
        name: "Unified Commerce & POS Ledger Sync",
        summary: "Every sale, online or in store, posts once to one ledger.",
        owns: "The transaction ledger: every entry, posted once.",
        sources: ["Point of sale", "Payment gateways"],
        schemaTitle: "LedgerEntry",
        schema: [
          ["tx", "TxId", "idempotency key"],
          ["account", "AccountCode"],
          ["debit", "decimal"],
          ["credit", "decimal"],
          ["source", "pos | web | erp | gateway"],
        ],
        invariant: "Σ debit = Σ credit, per transaction",
        params: [
          ["Model", "double-entry, append-only"],
          ["Idempotency", "one key per transaction"],
          ["Gateways", "settlement matched automatically"],
          ["Close", "daily close with variance report"],
          ["Audit", "immutable history, exportable"],
        ],
      },
    ] satisfies ModuleSpec[],
  },
  pillarB: {
    letter: "B",
    title: "Tailored Commercial Architecture",
    kind: "Bespoke systems",
    text: "From-scratch systems, engineered for unique, proprietary operational flows.",
    items: [
      {
        icon: "document",
        title: "Custom internal operating systems",
        tagline: "Replacing patchwork spreadsheets",
        text: "One system of record in place of a folder of spreadsheets: role-based views, enforced workflows, and a history of every change.",
        spec: [
          ["record", "single source of truth"],
          ["access", "role-based"],
          ["history", "append-only"],
        ],
      },
      {
        icon: "security",
        title: "Private agentic workflows",
        tagline: "Operating securely on client infrastructure",
        text: "Autonomous logic that runs inside your perimeter, on your hardware or your cloud account. Every action is logged, bounded by explicit permissions, and reversible.",
        spec: [
          ["runtime", "client infrastructure"],
          ["egress", "denied by default"],
          ["oversight", "approval gates, full action log"],
        ],
      },
      {
        icon: "data",
        title: "High-availability distributed databases",
        tagline: "With offline-first synchronization",
        text: "Replicated stores that keep accepting writes when the network does not, then converge deterministically when it returns.",
        spec: [
          ["writes", "local-first"],
          ["merge", "deterministic"],
          ["single point of failure", "none, by design"],
        ],
      },
    ],
  },
} as const;

export const mechanics = {
  index: "03",
  label: "System mechanics & technical rigor",
  audience: "For CTOs and technical evaluators",
  heading: "Specified like infrastructure, stated so it can be tested.",
  specs: [
    {
      label: "Data ownership",
      value: "Sovereign",
      text: "Complete sovereignty. Databases synchronize with client-controlled infrastructure.",
    },
    {
      label: "Reliability",
      value: "Offline-capable",
      text: "Operational nodes designed to function without internet disruption.",
    },
    {
      label: "Latency",
      value: "< 100 ms",
      text: "Sub-100ms internal state changes across multi-terminal setups.",
    },
    {
      label: "Integrations",
      value: "Deterministic",
      text: "Clean, deterministic APIs connecting legacy ERPs, payment gateways, and third-party logistics.",
    },
  ],
  trace: {
    title: "Representative event trace",
    note: "Illustrative sequence, not a benchmark.",
    lines: [
      ["comment", "# multi-terminal sale on the shop floor"],
      ["row", "t+000 ms", "term-02", "sale.created", "tx=A-10441"],
      ["row", "t+008 ms", "node-01", "ledger.posted", "Σdr = Σcr  ok"],
      ["row", "t+019 ms", "node-01", "stock.reserved", "sku=1042  -1"],
      ["row", "t+037 ms", "term-01", "state.applied", "v=2291"],
      ["row", "t+041 ms", "term-03", "state.applied", "v=2291"],
      ["gap"],
      ["comment", "# network lost: the node keeps working locally"],
      ["row", "t+912 ms", "term-02", "sale.created", "tx=A-10442"],
      ["row", "t+921 ms", "node-01", "ledger.posted", "queued=1"],
      ["gap"],
      ["comment", "# network restored: replicate to client-db"],
      ["row", "t+4.2 s", "node-01", "replicate", "converged  v=2292"],
    ],
  },
} as const;

export const heroStats = [
  { kind: "count", to: 30, prefix: "≥ ", suffix: "%", label: "Structural reduction in daily operational load" },
  { kind: "text", display: "18 h → < 1 s", label: "Inventory and supply synchronization" },
  { kind: "count", to: 100, prefix: "< ", suffix: " ms", label: "Internal state change across terminals" },
  { kind: "text", display: "Zero", label: "Black-box dependencies" },
] as const;

export const security = {
  index: "04",
  label: "Security & compliance",
  heading: "Stated plainly, so it can be checked.",
  lead: "Properties of the systems we build, written as specifications rather than assurances.",
  rows: [
    ["Data location", "Client-controlled infrastructure."],
    ["Access", "Role-based. Permissions are explicit and reviewable."],
    ["History", "An append-only record of changes and actions."],
    ["Agents", "Bounded permissions, approval gates, a full action log, and every action reversible."],
    ["Network", "Outbound access denied by default."],
    ["Failure", "Offline-capable nodes and deterministic recovery."],
  ],
  note: "We do not claim certifications on this page. If you must meet a specific regulation, we design to it and show you how.",
} as const;

export const how = {
  index: "05",
  label: "How we work",
  heading: "Four stages. One owner at each.",
  lead: "Every engagement follows the same order, so you always know what is being decided and what comes next.",
  stages: [
    {
      n: "01",
      name: "Understand",
      text: "We map how work actually moves through your business: systems, hand-offs, waiting and re-entry.",
      receive: "A written map of current operations, and the baseline for the 30% target.",
    },
    {
      n: "02",
      name: "Design",
      text: "We specify the system: data model, integrations, failure behavior, and what must run offline.",
      receive: "An architecture document you can hand to your own engineers.",
    },
    {
      n: "03",
      name: "Build",
      text: "We build and test in your environment, in stages, each one usable on its own.",
      receive: "Working software, tested against the baseline.",
    },
    {
      n: "04",
      name: "Operate",
      text: "We run it with you, monitor it, and hand over ownership when you are ready.",
      receive: "Runbooks, access, and the option to run it yourselves.",
    },
  ],
} as const;

export const models = {
  index: "06",
  label: "Engagement models",
  heading: "Two ways to start.",
  columns: [
    { key: "A", title: "Turnkey modules", kind: "Pillar A" },
    { key: "B", title: "Bespoke systems", kind: "Pillar B" },
  ],
  rows: [
    ["Best when", "Your process matches a standard shape: stock, units, a sales ledger.", "Your operations are particular to you and no product fits."],
    ["What we do", "Configure, connect and deploy a tested module.", "Specify and engineer from scratch."],
    ["From you", "Access to current systems, a named process owner, and your configuration decisions.", "Time with the people who run the work, access to systems and data, and a named decision-maker."],
    ["You get", "A running system, and training.", "A system built to your flow, with full documentation."],
    ["Start with", "The technical dossier.", "An architectural walkthrough."],
  ],
} as const;

export const faq = {
  index: "07",
  label: "Questions from engineers",
  heading: "Plain answers to the usual questions.",
  note: "Longer answers, with diagrams, are in the technical dossier.",
  items: [
    ["Who owns the data?", "You do. Databases synchronize with infrastructure you control, and we keep no copy that we depend on."],
    ["What happens without internet?", "Each node keeps working from its local ledger. Changes queue, then replicate in order when the connection returns."],
    ["How do we migrate from our current system?", "In stages. Data is imported and reconciled against the old system before anything is switched over, and the old system stays readable until you decide otherwise."],
    ["Can it connect to our ERP and payment gateway?", "Yes, through deterministic APIs: the same input always produces the same result, and every call is logged."],
    ["Do agents send our data to outside services?", "Not by default. Private agentic workflows run on your infrastructure, and outbound access is denied unless you allow it explicitly."],
    ["What if we outgrow a turnkey module?", "Modules share one data model, so a bespoke component can replace or extend one without a rebuild."],
  ],
} as const;

export const cta = {
  line: "If the work is heavier than it should be, we should talk.",
} as const;

export const manifesto = {
  index: "08",
  label: "The Sanad manifesto",
  heading: "Software should clarify the mind, not demand it.",
  body: "Most enterprise software creates its own bureaucracy. Teams spend hours managing the tool that was supposed to save them time. Sanad is built on the inverse thesis: intelligent software works silently in the background so leaders and builders can dedicate their focus to what actually matters.",
} as const;

export const footer = {
  docs: [
    { label: "Technical documentation", href: mailto("Request: technical documentation") },
    { label: "Whitepapers", href: mailto("Request: whitepapers") },
    { label: "Operational blueprints", href: mailto("Request: operational blueprints") },
  ],
  walkthroughHref: mailto("Architectural walkthrough"),
} as const;

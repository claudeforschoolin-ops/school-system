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

export type ModuleSpec = {
  id: "inventory" | "units" | "ledger";
  name: string;
  summary: string;
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

export const manifesto = {
  index: "04",
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

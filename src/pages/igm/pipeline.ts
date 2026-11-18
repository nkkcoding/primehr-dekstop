import type { IgmCandidate, IgmData, IgmDocument } from "../../lib/igmApi";
import { active, daysUntil } from "./igmHelpers";

export const PIPELINE_STEPS = [
  "Cerere firmă",
  "Sosire Moldova",
  "Contract semnat",
  "Documentare",
  "Depunere",
  "Ridicare",
  "Finalizat",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

/** Primary nav — keep the app simple. */
export const IGM_NAV_PRIMARY = [
  "Dashboard",
  "Companii",
  "Candidați",
  "Alerte & Termene",
  "Rapoarte",
] as const;

export const IGM_NAV_SECONDARY = [
  "Căutare globală",
  "Calendar IGM",
  "Invitații",
  "Decizii",
  "Permise de ședere",
  "Caziere",
  "Pașapoarte Nepal",
  "Dosare la IGM",
  "Ridicări de la IGM",
  "Schimbări candidați",
  "Candidați arhivați",
] as const;

const DONE: Record<PipelineStep, string[]> = {
  "Cerere firmă": ["Cererea firmei a fost înregistrată."],
  "Sosire Moldova": [
    "Cererea firmei a fost înregistrată.",
    "Candidatul a sosit în Moldova.",
  ],
  "Contract semnat": [
    "Cererea firmei a fost înregistrată.",
    "Candidatul a sosit în Moldova.",
    "Contractul de muncă a fost semnat.",
  ],
  Documentare: [
    "Cererea firmei a fost înregistrată.",
    "Candidatul a sosit în Moldova.",
    "Contractul de muncă a fost semnat.",
    "Pasul de documentare rulează pe termen de proces.",
  ],
  Depunere: [
    "Termenul de proces a fost setat.",
    "Dosarul este pregătit pentru depunere la IGM.",
  ],
  Ridicare: [
    "Dosarul a fost depus la IGM.",
    "Se așteaptă ridicarea documentelor (poate fi multiplă).",
  ],
  Finalizat: [
    "Toți pașii operaționali sunt închiși.",
    "Dosarul este finalizat.",
  ],
};

const NEXT: Record<PipelineStep, string[]> = {
  "Cerere firmă": ["Confirmă sosirea în Moldova.", "Leagă candidatul de firmă."],
  "Sosire Moldova": ["Semnează contractul cu firma.", "Încarcă contractul pe dosar."],
  "Contract semnat": ["Încarcă pașaportul.", "Pornește documentarea (termen proces)."],
  Documentare: ["Setează termenul de proces pe calendar.", "Apoi treci la depunere."],
  Depunere: ["Urmărește statusul la IGM.", "Programează ridicarea."],
  Ridicare: ["Bifează ce ridici azi (decizie / invitație / permis).", "Marchează dosarul ca finalizat."],
  Finalizat: ["Nicio acțiune operațională rămasă."],
};

/** Checklist items required before leaving the current step (advancing). */
export type CheckItem = { id: string; label: string; ok: boolean };

export function isPipelineStep(v: string): v is PipelineStep {
  return (PIPELINE_STEPS as readonly string[]).includes(v);
}

export function stepIndex(step: PipelineStep): number {
  return PIPELINE_STEPS.indexOf(step);
}

export function inferPipelineStep(data: IgmData, c: IgmCandidate): PipelineStep {
  if (c.pipelineStep && isPipelineStep(c.pipelineStep)) return c.pipelineStep;
  if (c.deletedAt) return "Finalizat";

  const docs = data.documents.filter((d) => active(d) && d.candidateId === c.id);
  const subs = data.submissions.filter((s) => active(s) && s.candidateId === c.id);
  const hasCoreDocs = docs.some((d) =>
    ["Pasaport Nepal", "Invitatie", "Decizie", "Permis de sedere", "Cazier", "Contract"].includes(
      d.type,
    ),
  );
  const hasDepus = subs.some((s) => s.status === "Depus");
  const hasProgramat = subs.some((s) => s.status === "Programat");

  if (hasDepus) return "Ridicare";
  if (hasProgramat || docs.some((d) => ["Invitatie", "Decizie", "Permis de sedere"].includes(d.type))) {
    return "Depunere";
  }
  if (hasCoreDocs) return "Documentare";
  if (c.companyId && c.status === "Activ") return "Contract semnat";
  if (c.companyId) return "Sosire Moldova";
  return "Cerere firmă";
}

const PROCESS_SLA_DAYS: Partial<Record<PipelineStep, number>> = {
  Documentare: 14,
  Depunere: 14,
  Ridicare: 14,
};

/**
 * Process window only — never document expiry (permis etc.).
 * Uses explicit pipelineDeadline if set, else SLA from step start.
 */
export function stepDeadlineDays(_data: IgmData, c: IgmCandidate, step: PipelineStep): number | null {
  if (c.pipelineDeadline) {
    return daysUntil(c.pipelineDeadline.slice(0, 10));
  }
  const sla = PROCESS_SLA_DAYS[step];
  if (sla == null) return null;
  const started = c.pipelineStepAt || c.createdAt;
  if (!started) return sla;
  const day = started.slice(0, 10);
  const elapsed = daysUntil(day);
  if (elapsed === null) return sla;
  return sla - -elapsed;
}

export function stepStatusLabel(days: number | null, step: PipelineStep): string {
  if (step === "Finalizat") return "Completat";
  if (days === null) return "În lucru";
  if (days < 0) return "Întârziat";
  if (days <= 3) return "Urgent";
  if (days <= 9) return "Aproape";
  return "În lucru";
}

export function doneItems(step: PipelineStep): string[] {
  return DONE[step];
}

export function nextItems(step: PipelineStep): string[] {
  return NEXT[step];
}

export function candidateDocs(data: IgmData, candidateId: string): IgmDocument[] {
  return data.documents.filter((d) => active(d) && d.candidateId === candidateId);
}

function hasFileOfType(data: IgmData, candidateId: string, type: string): boolean {
  const docs = candidateDocs(data, candidateId).filter((d) => d.type === type);
  if (!docs.length) return false;
  const ids = new Set(docs.map((d) => d.id));
  return data.files.some((f) => ids.has(f.documentId));
}

function hasAnyFile(data: IgmData, candidateId: string): boolean {
  const docs = candidateDocs(data, candidateId);
  const ids = new Set(docs.map((d) => d.id));
  return data.files.some((f) => ids.has(f.documentId));
}

/** Checklist for advancing FROM current step. */
export function advanceChecklist(data: IgmData, c: IgmCandidate, step: PipelineStep): CheckItem[] {
  const items: CheckItem[] = [];
  if (step === "Cerere firmă") {
    items.push({ id: "company", label: "Compania este legată", ok: Boolean(c.companyId) });
  }
  if (step === "Sosire Moldova") {
    items.push({
      id: "contract",
      label: "Contract de muncă încărcat pe dosar",
      ok: hasFileOfType(data, c.id, "Contract"),
    });
  }
  if (step === "Contract semnat") {
    items.push({
      id: "contract",
      label: "Contract încărcat",
      ok: hasFileOfType(data, c.id, "Contract"),
    });
    items.push({
      id: "passport",
      label: "Pașaport sau alt act încărcat",
      ok: hasFileOfType(data, c.id, "Pasaport Nepal") || hasAnyFile(data, c.id),
    });
  }
  if (step === "Documentare") {
    items.push({
      id: "deadline",
      label: "Termen proces setat pe calendar",
      ok: Boolean(c.pipelineDeadline),
    });
  }
  if (step === "Ridicare") {
    const hasPickup = data.pickups.some(
      (p) => active(p) && p.companyId === c.companyId,
    );
    items.push({
      id: "pickup",
      label: "Cel puțin o ridicare înregistrată pentru firmă",
      ok: hasPickup,
    });
  }
  return items;
}

export function canAdvance(data: IgmData, c: IgmCandidate, step: PipelineStep): { ok: boolean; blockers: string[] } {
  const list = advanceChecklist(data, c, step);
  const blockers = list.filter((x) => !x.ok).map((x) => x.label);
  return { ok: blockers.length === 0, blockers };
}

export function defaultDocTypeForStep(step: PipelineStep): string {
  if (step === "Contract semnat" || step === "Sosire Moldova") return "Contract";
  if (step === "Documentare") return "Alt document";
  if (step === "Depunere") return "Invitatie";
  return "Alt document";
}

export function previousStep(step: PipelineStep): PipelineStep | null {
  const i = stepIndex(step);
  if (i <= 0) return null;
  return PIPELINE_STEPS[i - 1];
}

export function companyStats(data: IgmData, companyId: string) {
  const people = data.candidates.filter((c) => !c.deletedAt && c.companyId === companyId);
  const counts = {
    total: people.length,
    documentare: 0,
    igm: 0,
    ridicare: 0,
    late: 0,
    done: 0,
    active: 0,
  };
  for (const p of people) {
    const step = inferPipelineStep(data, p);
    if (step === "Finalizat") counts.done += 1;
    else counts.active += 1;
    if (step === "Documentare") counts.documentare += 1;
    if (step === "Depunere") counts.igm += 1;
    if (step === "Ridicare") counts.ridicare += 1;
    const days = stepDeadlineDays(data, p, step);
    if (days !== null && days < 0) counts.late += 1;
  }
  return counts;
}

/** Short status for company cards on Dashboard. */
export function companyStatusCaption(st: ReturnType<typeof companyStats>): string {
  if (!st.total) return "fără candidați";
  if (st.done === st.total) return "Completat";
  if (st.late) return `${st.late} întârziați`;
  if (st.ridicare) return `${st.ridicare} de ridicat`;
  if (st.igm) return `${st.igm} la IGM`;
  if (st.documentare) return `${st.documentare} documentare`;
  return "În lucru";
}

/** Candidates whose process SLA is overdue. */
export function delayedProcessPeople(data: IgmData) {
  return data.candidates
    .filter((c) => !c.deletedAt)
    .map((c) => {
      const step = inferPipelineStep(data, c);
      const days = stepDeadlineDays(data, c, step);
      return { c, step, days };
    })
    .filter((x) => x.days !== null && (x.days as number) < 0)
    .sort((a, b) => (a.days as number) - (b.days as number));
}

export function urgentProcessPeople(data: IgmData) {
  return data.candidates
    .filter((c) => !c.deletedAt)
    .map((c) => {
      const step = inferPipelineStep(data, c);
      const days = stepDeadlineDays(data, c, step);
      return { c, step, days };
    })
    .filter((x) => x.days !== null && (x.days as number) >= 0 && (x.days as number) <= 3)
    .sort((a, b) => (a.days as number) - (b.days as number));
}

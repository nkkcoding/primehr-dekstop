import type { IgmCandidate, IgmCompany, IgmData, IgmDocument } from "../../lib/igmApi";

export function today(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function fmt(x?: string): string {
  if (x && /^\d{4}-\d{2}-\d{2}$/.test(x)) return x.split("-").reverse().join(".");
  return x || "—";
}

export function daysUntil(x?: string): number | null {
  if (!x) return null;
  return Math.round(
    (new Date(x + "T12:00:00").getTime() - new Date(today() + "T12:00:00").getTime()) / 86400000,
  );
}

export function cn(c?: IgmCandidate | null): string {
  return c ? `${c.firstName} ${c.lastName}`.trim() : "";
}

export function companyName(data: IgmData, id?: string): string {
  if (!id) return "Neatribuită";
  return data.companies.find((x) => x.id === id)?.name || "Neatribuită";
}

export function candidateOf(data: IgmData, id?: string): IgmCandidate | undefined {
  return data.candidates.find((x) => x.id === id);
}

export function active<T extends { deletedAt?: string }>(x: T): boolean {
  return !x.deletedAt;
}

export function zone(days: number | null): string {
  if (days === null) return "blue";
  if (days < 0) return "red";
  if (days <= 30) return "red";
  if (days <= 60) return "yellow";
  if (days <= 90) return "green";
  return "blue";
}

export function fingerprint(x: IgmDocument | IgmCandidate, cat: "alerts" | "archived"): string {
  if (cat === "alerts") {
    const d = x as IgmDocument;
    return [d.expiryDate, d.type, d.alertDays].join("|");
  }
  return String((x as IgmCandidate).deletedAt);
}

export function unseen(data: IgmData, cat: "alerts" | "archived") {
  const ack = new Set(
    (data.acknowledgements || [])
      .filter((x) => x.category === cat)
      .map((x) => `${x.recordId}|${x.fingerprint}`),
  );
  const items =
    cat === "alerts"
      ? data.documents.filter(
          (x) =>
            active(x) &&
            x.type !== "Pasaport Nepal" &&
            x.expiryDate &&
            (daysUntil(x.expiryDate) ?? 999) <= 30,
        )
      : data.candidates.filter((x) => !!x.deletedAt);
  return items.filter((x) => !ack.has(`${x.id}|${fingerprint(x, cat)}`));
}

export function matchFilter(filter: string, ...args: unknown[]): boolean {
  const q = filter.trim().toLocaleLowerCase();
  if (!q) return true;
  return args.join(" ").toLocaleLowerCase().includes(q);
}

export function normSearch(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function activeCompanies(data: IgmData): IgmCompany[] {
  return data.companies.filter(active);
}

export function activePeople(data: IgmData): IgmCandidate[] {
  return data.candidates.filter(active);
}

export function activeDocs(data: IgmData): IgmDocument[] {
  return data.documents.filter(active);
}

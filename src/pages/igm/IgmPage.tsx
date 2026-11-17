import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { getWsUrl } from "../../lib/api";
import {
  DOC_TYPE_BY_PAGE,
  IGM_PAGES,
  IgmApi,
  type IgmCandidate,
  type IgmData,
  type IgmPageName,
} from "../../lib/igmApi";
import type { ShellOutletContext } from "../ShellPage";
import {
  active,
  activeCompanies,
  activeDocs,
  activePeople,
  candidateOf,
  cn,
  companyName,
  daysUntil,
  fingerprint,
  fmt,
  matchFilter,
  normSearch,
  today,
  unseen,
  zone,
} from "./igmHelpers";

type ModalKind =
  | null
  | "company"
  | "companyEdit"
  | "candidate"
  | "candidateEdit"
  | "archive"
  | "transfer"
  | "document"
  | "documentEdit"
  | "submission"
  | "submissionEdit"
  | "pickup"
  | "pickupEdit"
  | "batch";

const emptyData = (): IgmData => ({
  companies: [],
  candidates: [],
  documents: [],
  submissions: [],
  pickups: [],
  pickupItems: [],
  transfers: [],
  audit: [],
  acknowledgements: [],
  files: [],
});

export default function IgmPage() {
  const navigate = useNavigate();
  const { user, onLogout } = useOutletContext<ShellOutletContext>();
  const [data, setData] = useState<IgmData>(emptyData());
  const [page, setPage] = useState<IgmPageName>("Dashboard");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(today().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [editId, setEditId] = useState("");
  const [presetType, setPresetType] = useState("Invitatie");
  const [formError, setFormError] = useState("");

  const roleBadge =
    user.role === "CEO"
      ? "CEO Documente"
      : user.role === "ADMIN"
        ? "Admin Documente"
        : "Angajat IGM";

  const refresh = useCallback(async () => {
    const bundle = await IgmApi.data();
    setData(bundle);
  }, []);

  useEffect(() => {
    setBusy(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Eroare IGM"))
      .finally(() => setBusy(false));
  }, [refresh]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    function connect() {
      if (closed) return;
      try {
        ws = new WebSocket(getWsUrl());
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as { event?: string };
            if (msg.event === "igm:changed") {
              setFlash("Actualizare IGM de pe host");
              void refresh();
              setTimeout(() => setFlash(null), 2500);
            }
          } catch {
            /* ignore */
          }
        };
        ws.onclose = () => {
          if (!closed) setTimeout(connect, 2000);
        };
      } catch {
        setTimeout(connect, 2000);
      }
    }
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, [refresh]);

  const alertCount = useMemo(() => unseen(data, "alerts").length, [data]);
  const archivedUnseen = useMemo(() => unseen(data, "archived").length, [data]);

  function openModal(kind: ModalKind, id = "", type = "Invitatie") {
    setModal(kind);
    setEditId(id);
    setPresetType(type);
    setFormError("");
  }

  async function run(action: () => Promise<unknown>) {
    setFormError("");
    setError(null);
    setBusy(true);
    try {
      await action();
      await refresh();
      setModal(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Operațiune eșuată";
      if (modal) setFormError(msg);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function softDelete(table: string, id: string) {
    const reason = window.prompt("Motivul anulării/arhivării (obligatoriu):");
    if (!reason?.trim()) return;
    await run(() => IgmApi.softDelete(table, id, reason.trim()));
  }

  async function markAllSeen(cat: "alerts" | "archived") {
    const items = unseen(data, cat).map((x) => ({
      id: x.id,
      fingerprint: fingerprint(x, cat),
    }));
    if (!items.length) return;
    await run(() => IgmApi.markSeen(cat, items));
  }

  return (
    <div className="igm-root">
      <div className="igm-layout">
        <nav className="igm-nav" aria-label="Secțiuni IGM">
          <div className="igm-nav-brand">
            Documente &amp; IGM
            <small>Prime HR Solutions</small>
          </div>
          <div className="igm-nav-scroll">
            {IGM_PAGES.map((p) => (
              <button
                key={p}
                type="button"
                className={`igm-nav-btn ${page === p ? "active" : ""}`}
                onClick={() => {
                  setPage(p);
                  setFilter("");
                  setSelected("");
                }}
              >
                <span>{p}</span>
                {p === "Alerte & Termene" && alertCount > 0 ? (
                  <span className="igm-badge">{alertCount}</span>
                ) : null}
                {p === "Candidați arhivați" && archivedUnseen > 0 ? (
                  <span className="igm-badge">{archivedUnseen}</span>
                ) : null}
              </button>
            ))}
          </div>
        </nav>

        <div className="igm-main">
          <header className="igm-header">
            <div>
              <h1>{page === "Dashboard" ? "Dashboard IGM" : page}</h1>
              <p className="lead">Evidența documentelor și operațiunilor IGM</p>
            </div>
            <span className="badge">{roleBadge}</span>
          </header>

          {flash ? <div className="igm-flash">{flash}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          {busy && !modal ? <p className="hint">Se încarcă…</p> : null}

          {page === "Dashboard" ? <DashboardView data={data} go={setPage} /> : null}
          {page === "Calendar IGM" ? (
            <CalendarView
              data={data}
              month={calendarMonth}
              setMonth={setCalendarMonth}
              go={setPage}
            />
          ) : null}
          {page === "Căutare globală" ? (
            <GlobalSearchView data={data} query={globalQuery} setQuery={setGlobalQuery} go={setPage} />
          ) : null}
          {page === "Candidați" || page === "Candidați arhivați" ? (
            <PeopleView
              data={data}
              archived={page === "Candidați arhivați"}
              filter={filter}
              setFilter={setFilter}
              selected={selected}
              setSelected={setSelected}
              openModal={openModal}
              onRestore={(id) => {
                if (window.confirm("Reactivăm candidatul în registru?")) {
                  void run(() => IgmApi.restoreCandidate(id));
                }
              }}
              onMarkSeen={() => void markAllSeen("archived")}
              unseenArchived={archivedUnseen}
            />
          ) : null}
          {page === "Companii" ? (
            <CompaniesView
              data={data}
              filter={filter}
              setFilter={setFilter}
              openModal={openModal}
              softDelete={softDelete}
            />
          ) : null}
          {DOC_TYPE_BY_PAGE[page] ? (
            <DocumentsView
              data={data}
              type={DOC_TYPE_BY_PAGE[page]!}
              page={page}
              filter={filter}
              setFilter={setFilter}
              openModal={openModal}
              softDelete={softDelete}
              onUpload={async (docId, file) => {
                await run(() => IgmApi.uploadFile(docId, file));
              }}
            />
          ) : null}
          {page === "Dosare la IGM" ? (
            <SubmissionsView
              data={data}
              filter={filter}
              setFilter={setFilter}
              openModal={openModal}
              softDelete={softDelete}
            />
          ) : null}
          {page === "Ridicări de la IGM" ? (
            <PickupsView
              data={data}
              filter={filter}
              setFilter={setFilter}
              openModal={openModal}
              softDelete={softDelete}
            />
          ) : null}
          {page === "Schimbări candidați" ? (
            <TransfersView data={data} openModal={openModal} />
          ) : null}
          {page === "Alerte & Termene" ? (
            <AlertsView
              data={data}
              openModal={openModal}
              softDelete={softDelete}
              onMarkSeen={() => void markAllSeen("alerts")}
              canMark={alertCount > 0}
            />
          ) : null}
          {page === "Rapoarte" ? <ReportsView data={data} /> : null}

          <div className="igm-main-foot">
            <button
              type="button"
              className="igm-logout-btn"
              onClick={() => {
                void onLogout().then(() => navigate("/login"));
              }}
            >
              Ieșire
            </button>
          </div>
        </div>
      </div>

      {modal ? (
        <IgmModal
          kind={modal}
          editId={editId}
          presetType={presetType}
          data={data}
          formError={formError}
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(body) => {
            void run(async () => {
              switch (modal) {
                case "company":
                  await IgmApi.addCompany(String(body.name));
                  break;
                case "companyEdit":
                  await IgmApi.updateCompany(editId, String(body.name));
                  break;
                case "candidate":
                  await IgmApi.addCandidate(body);
                  break;
                case "candidateEdit":
                  await IgmApi.updateCandidate(editId, body);
                  break;
                case "archive":
                  await IgmApi.archiveCandidate(
                    editId,
                    String(body.reason),
                    String(body.lastWorkDate),
                  );
                  break;
                case "transfer":
                  await IgmApi.transfer(body);
                  break;
                case "document":
                  await IgmApi.addDocument(body);
                  break;
                case "documentEdit":
                  await IgmApi.updateDocument(editId, body);
                  break;
                case "submission":
                  await IgmApi.addSubmission(body);
                  break;
                case "submissionEdit":
                  await IgmApi.updateSubmission(editId, body);
                  break;
                case "pickup":
                  await IgmApi.addPickup(body);
                  break;
                case "pickupEdit":
                  await IgmApi.updatePickup(editId, body);
                  break;
                case "batch":
                  await IgmApi.cazierBatch(body);
                  break;
                default:
                  break;
              }
            });
          }}
        />
      ) : null}
    </div>
  );
}

function Chip({ text, color = "blue" }: { text: string; color?: string }) {
  return <span className={`igm-chip ${color}`}>{text}</span>;
}

function Metric({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div className="igm-metric">
      <div className="heading">{label}</div>
      <div className="num">{value}</div>
      <div className="caption">{sub}</div>
    </div>
  );
}

function DashboardView({ data, go }: { data: IgmData; go: (p: IgmPageName) => void }) {
  const docs = activeDocs(data);
  const people = activePeople(data);
  const exp = docs.filter((x) => x.expiryDate && x.type !== "Pasaport Nepal");
  const range = (a: number, b: number) =>
    exp.filter((x) => {
      const d = daysUntil(x.expiryDate);
      return d !== null && d >= a && d <= b;
    }).length;
  const types = ["Permis de sedere", "Invitatie", "Decizie", "Cazier", "Pasaport Nepal"];
  const counts = types.map((t) => docs.filter((x) => x.type === t).length);
  const max = Math.max(1, ...counts);
  const upcoming = data.submissions
    .filter((x) => active(x) && x.scheduledDate && x.status !== "Anulat")
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .slice(0, 6);

  return (
    <>
      <div className="igm-metricgrid">
        <Metric label="Candidați activi" value={people.length} sub="În registrul curent" />
        <Metric
          label="Companii"
          value={activeCompanies(data).length}
          sub="Manuale + înregistrate"
        />
        <Metric
          label="Dosare IGM"
          value={data.submissions.filter(active).length}
          sub={`${data.submissions.filter((x) => active(x) && x.status === "Programat").length} programate`}
        />
        <Metric label="Expiră ≤ 30 zile" value={range(-9999, 30)} sub="Necesită atenție" />
        <Metric label="Expiră 31–60 zile" value={range(31, 60)} sub="Avertizare" />
        <Metric label="Expiră 61–90 zile" value={range(61, 90)} sub="Monitorizare" />
      </div>
      <div className="igm-dash-grid">
        <div className="card-plain">
          <h2>Documente pe tip</h2>
          {types.map((t, i) => (
            <div className="igm-chartrow" key={t}>
              <span>{t}</span>
              <div className="bartrack">
                <div className="barfill" style={{ width: `${(counts[i] / max) * 100}%` }} />
              </div>
              <strong>{counts[i]}</strong>
            </div>
          ))}
        </div>
        <div className="card-plain">
          <h2>Calendar operațiuni IGM</h2>
          {upcoming.length ? (
            upcoming.map((x) => (
              <div className="igm-listrow" key={x.id}>
                <div>
                  <strong>{fmt(x.scheduledDate)}</strong>
                  <div className="hint">
                    {companyName(data, x.companyId)} · {x.type}
                  </div>
                </div>
                <Chip text={x.status || "Programat"} color={x.status === "Depus" ? "green" : "blue"} />
              </div>
            ))
          ) : (
            <p className="hint">Nu sunt programări înregistrate.</p>
          )}
        </div>
        <div className="card-plain">
          <h2>Alerte documente</h2>
          {(
            [
              [0, 30, "≤ 30 zile", "red"],
              [31, 60, "31–60 zile", "yellow"],
              [61, 90, "61–90 zile", "green"],
            ] as const
          ).map(([a, b, t, c]) => (
            <button
              key={t}
              type="button"
              className={`igm-alertline ${c}`}
              onClick={() => go("Alerte & Termene")}
            >
              <strong>{t}</strong>
              <span>{range(a, b)} documente →</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function opsList(data: IgmData) {
  const list: {
    date: string;
    kind: string;
    detail: string;
    status: string;
    page: IgmPageName;
  }[] = [];
  data.submissions.filter(active).forEach((x) => {
    if (x.scheduledDate && x.status !== "Anulat" && x.status !== "Depus") {
      list.push({
        date: x.scheduledDate,
        kind: "Depunere dosar",
        detail: `${companyName(data, x.companyId)} · ${cn(candidateOf(data, x.candidateId)) || x.type}`,
        status: x.status || "Programat",
        page: "Dosare la IGM",
      });
    }
  });
  activeDocs(data).forEach((x) => {
    const d = daysUntil(x.expiryDate);
    if (x.expiryDate && x.type !== "Pasaport Nepal" && d !== null && d <= 30) {
      list.push({
        date: x.expiryDate,
        kind: `Expirare ${x.type}`,
        detail: `${cn(candidateOf(data, x.candidateId))} · ${companyName(data, x.companyId)}`,
        status: d < 0 ? "Expirat" : "Urgent",
        page: "Alerte & Termene",
      });
    }
  });
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

function CalendarView({
  data,
  month,
  setMonth,
  go,
}: {
  data: IgmData;
  month: string;
  setMonth: (m: string) => void;
  go: (p: IgmPageName) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const offset = (start.getDay() + 6) % 7;
  const count = new Date(y, m, 0).getDate();
  const items = opsList(data);
  const byDay: Record<string, typeof items> = {};
  items.forEach((x) => {
    (byDay[x.date] || (byDay[x.date] = [])).push(x);
  });

  function shift(n: number) {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const cells = [];
  for (let i = 0; i < offset + count; i++) {
    const d = i - offset + 1;
    const key = `${month}-${String(d).padStart(2, "0")}`;
    const a = byDay[key] || [];
    cells.push(
      <div
        key={i}
        className={`igm-calday ${d < 1 ? "empty" : ""} ${key === today() ? "today" : ""}`}
      >
        {d > 0 ? (
          <>
            <strong>{d}</strong>
            {a.slice(0, 3).map((x, idx) => (
              <button
                key={idx}
                type="button"
                className="igm-calitem"
                title={x.detail}
                onClick={() => go(x.page)}
              >
                {x.kind}
              </button>
            ))}
            {a.length > 3 ? <small>+{a.length - 3} altele</small> : null}
          </>
        ) : null}
      </div>,
    );
  }

  return (
    <div className="card-plain">
      <div className="igm-toolbar between">
        <h2>
          Calendar IGM ·{" "}
          {start.toLocaleDateString("ro-RO", { month: "long", year: "numeric" })}
        </h2>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => shift(-1)}>
            ←
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setMonth(today().slice(0, 7))}
          >
            Astăzi
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => shift(1)}>
            →
          </button>
        </div>
      </div>
      <div className="igm-calgrid">
        {["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"].map((x) => (
          <strong key={x} className="igm-calhead">
            {x}
          </strong>
        ))}
        {cells}
      </div>
    </div>
  );
}

function GlobalSearchView({
  data,
  query,
  setQuery,
  go,
}: {
  data: IgmData;
  query: string;
  setQuery: (q: string) => void;
  go: (p: IgmPageName) => void;
}) {
  const q = normSearch(query.trim());
  const terms = q.split(/\s+/).filter(Boolean);
  const hit = (x: string) => terms.every((t) => normSearch(x).includes(t));
  const rows: [string, string, string, IgmPageName][] = [];
  if (q) {
    activePeople(data).forEach((c) => {
      if (hit(`${cn(c)} ${c.id} ${companyName(data, c.companyId)}`)) {
        rows.push(["Candidat", cn(c), companyName(data, c.companyId), "Candidați"]);
      }
    });
    activeCompanies(data).forEach((c) => {
      if (hit(`${c.name} ${c.id}`)) rows.push(["Companie", c.name, c.id, "Companii"]);
    });
    activeDocs(data).forEach((d) => {
      if (
        hit(
          `${cn(candidateOf(data, d.candidateId))} ${companyName(data, d.companyId)} ${d.number} ${d.trackingNumber} ${d.type}`,
        )
      ) {
        const section =
          (Object.entries(DOC_TYPE_BY_PAGE).find(([, t]) => t === d.type)?.[0] as IgmPageName) ||
          "Candidați";
        rows.push([
          "Document",
          `${d.type} · ${d.number || "Fără număr"}`,
          `${cn(candidateOf(data, d.candidateId))} · ${companyName(data, d.companyId)}`,
          section,
        ]);
      }
    });
    data.submissions.filter(active).forEach((x) => {
      if (
        hit(
          `${cn(candidateOf(data, x.candidateId))} ${companyName(data, x.companyId)} ${x.type} ${x.number}`,
        )
      ) {
        rows.push([
          "Dosar IGM",
          x.type,
          `${cn(candidateOf(data, x.candidateId))} · ${companyName(data, x.companyId)}`,
          "Dosare la IGM",
        ]);
      }
    });
  }

  return (
    <div className="card-plain">
      <h2>Căutare globală</h2>
      <input
        className="igm-input"
        placeholder="Nume, prenume, companie, număr document, UPS…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!q ? (
        <p className="hint">Introdu cel puțin un cuvânt pentru a căuta în registru.</p>
      ) : (
        <>
          <p className="hint">
            {rows.length} rezultate{rows.length > 100 ? " (primele 100)" : ""}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Tip</th>
                <th>Rezultat</th>
                <th>Detalii</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r, i) => (
                <tr key={i}>
                  <td>{r[0]}</td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                  <td>
                    <button type="button" className="btn btn-ghost" onClick={() => go(r[3])}>
                      Vezi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function PeopleView({
  data,
  archived,
  filter,
  setFilter,
  selected,
  setSelected,
  openModal,
  onRestore,
  onMarkSeen,
  unseenArchived,
}: {
  data: IgmData;
  archived: boolean;
  filter: string;
  setFilter: (v: string) => void;
  selected: string;
  setSelected: (v: string) => void;
  openModal: (k: ModalKind, id?: string) => void;
  onRestore: (id: string) => void;
  onMarkSeen: () => void;
  unseenArchived: number;
}) {
  const arr = data.candidates.filter(
    (c) =>
      !!c.deletedAt === archived &&
      matchFilter(filter, cn(c), companyName(data, c.companyId), c.id),
  );
  const current = arr.find((x) => x.id === selected) || arr[0];

  return (
    <>
      {archived ? (
        <div className="igm-toolbar end">
          <button type="button" className="btn" disabled={!unseenArchived} onClick={onMarkSeen}>
            ✓ Marchează toate ca văzute
          </button>
        </div>
      ) : (
        <div className="igm-toolbar">
          <button type="button" className="btn" onClick={() => openModal("candidate")}>
            ＋ Adaugă candidat
          </button>
        </div>
      )}
      <div className="igm-split">
        <div className="card-plain">
          <h2>
            {archived ? "Candidați arhivați" : "Candidați"} ({arr.length})
          </h2>
          <input
            className="igm-input"
            placeholder="Nume, prenume, companie sau ID"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="igm-people">
            {arr.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`igm-person ${current?.id === c.id ? "active" : ""}`}
                onClick={() => setSelected(c.id)}
              >
                <strong>{cn(c)}</strong>
                <small>
                  {companyName(data, c.companyId)} · {c.id}
                </small>
              </button>
            ))}
            {!arr.length ? <p className="hint">Niciun candidat.</p> : null}
          </div>
        </div>
        <div className="card-plain">
          {current ? (
            <PersonDetail
              data={data}
              c={current}
              openModal={openModal}
              onRestore={onRestore}
            />
          ) : (
            <p className="hint">Selectează un candidat.</p>
          )}
        </div>
      </div>
    </>
  );
}

function PersonDetail({
  data,
  c,
  openModal,
  onRestore,
}: {
  data: IgmData;
  c: IgmCandidate;
  openModal: (k: ModalKind, id?: string) => void;
  onRestore: (id: string) => void;
}) {
  const docs = data.documents.filter((x) => x.candidateId === c.id && active(x));
  const subs = data.submissions.filter((x) => x.candidateId === c.id && active(x));
  const tr = data.transfers.filter((x) => x.candidateId === c.id);
  const events = [
    ...docs.map((x) => ({
      date: x.issueDate || x.sentDate,
      what: `Document ${x.type}`,
      info: x.number,
    })),
    ...subs.map((x) => ({
      date: x.date || x.scheduledDate,
      what: `Dosar ${x.type}`,
      info: x.status || "Depus",
    })),
    ...tr.map((x) => ({
      date: x.effectiveDate,
      what: "Transfer",
      info: `${companyName(data, x.fromCompanyId)} → ${companyName(data, x.toCompanyId)}`,
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return (
    <>
      <h2>{cn(c)}</h2>
      <p className="hint">
        {companyName(data, c.companyId)} · {c.id} · {c.status}
      </p>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        {c.deletedAt ? (
          <button type="button" className="btn" onClick={() => onRestore(c.id)}>
            Dezarhivează
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => openModal("candidateEdit", c.id)}>
              Modifică
            </button>
            <button type="button" className="btn btn-danger" onClick={() => openModal("archive", c.id)}>
              Arhivează
            </button>
          </>
        )}
      </div>
      {c.deletedAt ? (
        <p>
          Motiv: {c.archiveReason || "—"} · Ultima zi: {fmt(c.lastWorkDate)}
        </p>
      ) : null}
      <h3>Istoricul candidatului</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Operațiune</th>
            <th>Detalii</th>
          </tr>
        </thead>
        <tbody>
          {events.map((x, i) => (
            <tr key={i}>
              <td>{fmt(x.date)}</td>
              <td>{x.what}</td>
              <td>{x.info}</td>
            </tr>
          ))}
          {!events.length ? (
            <tr>
              <td colSpan={3} className="hint">
                Nu există înregistrări.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </>
  );
}

function CompaniesView({
  data,
  filter,
  setFilter,
  openModal,
  softDelete,
}: {
  data: IgmData;
  filter: string;
  setFilter: (v: string) => void;
  openModal: (k: ModalKind, id?: string) => void;
  softDelete: (table: string, id: string) => Promise<void>;
}) {
  const arr = activeCompanies(data).filter((c) => matchFilter(filter, c.name));
  return (
    <>
      <div className="igm-toolbar">
        <button type="button" className="btn" onClick={() => openModal("company")}>
          ＋ Adaugă companie
        </button>
        <input
          className="igm-input narrow"
          placeholder="Caută…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="card-plain">
        <h2>Companii ({arr.length})</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Companie</th>
              <th>Candidați activi</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {arr.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{activePeople(data).filter((x) => x.companyId === c.id).length}</td>
                <td className="btn-row">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => openModal("companyEdit", c.id)}
                  >
                    Modifică
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void softDelete("companies", c.id)}
                  >
                    Arhivează
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DocumentsView({
  data,
  type,
  page,
  filter,
  setFilter,
  openModal,
  softDelete,
  onUpload,
}: {
  data: IgmData;
  type: string;
  page: string;
  filter: string;
  setFilter: (v: string) => void;
  openModal: (k: ModalKind, id?: string, t?: string) => void;
  softDelete: (table: string, id: string) => Promise<void>;
  onUpload: (docId: string, file: File) => Promise<void>;
}) {
  const arr = activeDocs(data).filter(
    (x) =>
      x.type === type &&
      matchFilter(
        filter,
        cn(candidateOf(data, x.candidateId)),
        companyName(data, x.companyId),
        x.number,
        x.trackingNumber,
      ),
  );
  const passport = type === "Pasaport Nepal";
  const addLabel =
    type === "Cazier"
      ? "Adaugă caziere (lot)"
      : type === "Pasaport Nepal"
        ? "Adaugă pașaport Nepal"
        : `Adaugă ${page.toLowerCase().replace(/ii$/, "ie").replace(/e$/, "ă") || "document"}`;

  return (
    <>
      <div className="igm-toolbar">
        <button
          type="button"
          className="btn"
          onClick={() => openModal(type === "Cazier" ? "batch" : "document", "", type)}
        >
          ＋ {addLabel}
        </button>
        <input
          className="igm-input narrow"
          placeholder="Caută…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="card-plain">
        <h2>
          {page} ({arr.length})
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th>Candidat</th>
              <th>Companie</th>
              {passport ? (
                <>
                  <th>Nr. pașaport</th>
                  <th>Tracking UPS</th>
                  <th>Trimitere</th>
                </>
              ) : (
                <>
                  <th>Număr</th>
                  <th>Emitere</th>
                  <th>Expirare</th>
                  <th>Zile</th>
                </>
              )}
              <th>Fișiere</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {arr.map((x) => {
              const d = daysUntil(x.expiryDate);
              const files = data.files.filter((f) => f.documentId === x.id);
              return (
                <tr key={x.id}>
                  <td>{cn(candidateOf(data, x.candidateId))}</td>
                  <td>{companyName(data, x.companyId)}</td>
                  {passport ? (
                    <>
                      <td>{x.number || "—"}</td>
                      <td>{x.trackingNumber || "—"}</td>
                      <td>{fmt(x.sentDate)}</td>
                    </>
                  ) : (
                    <>
                      <td>{x.number || "—"}</td>
                      <td>{fmt(x.issueDate)}</td>
                      <td>{fmt(x.expiryDate)}</td>
                      <td>
                        {x.expiryDate && d !== null ? (
                          <Chip text={`${d} zile`} color={zone(d)} />
                        ) : (
                          "—"
                        )}
                      </td>
                    </>
                  )}
                  <td>
                    {files.map((f) => (
                      <a
                        key={f.id}
                        className="igm-file-link"
                        href={IgmApi.downloadUrl(f.id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {f.originalName}
                      </a>
                    ))}
                    <label className="igm-upload">
                      + PDF/PNG
                      <input
                        type="file"
                        accept=".pdf,.png,application/pdf,image/png"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void onUpload(x.id, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </td>
                  <td className="btn-row">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => openModal("documentEdit", x.id, x.type)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void softDelete("documents", x.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SubmissionsView({
  data,
  filter,
  setFilter,
  openModal,
  softDelete,
}: {
  data: IgmData;
  filter: string;
  setFilter: (v: string) => void;
  openModal: (k: ModalKind, id?: string) => void;
  softDelete: (table: string, id: string) => Promise<void>;
}) {
  const arr = data.submissions.filter(
    (x) =>
      active(x) &&
      matchFilter(
        filter,
        companyName(data, x.companyId),
        cn(candidateOf(data, x.candidateId)),
        x.type,
        x.number,
      ),
  );
  return (
    <>
      <div className="igm-toolbar">
        <button type="button" className="btn" onClick={() => openModal("submission")}>
          ＋ Programează / depune dosar IGM
        </button>
        <input
          className="igm-input narrow"
          placeholder="Caută…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="card-plain">
        <h2>Programări și dosare IGM</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Programare</th>
              <th>Depunere</th>
              <th>Companie</th>
              <th>Candidat</th>
              <th>Tip</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {arr.map((x) => (
              <tr key={x.id}>
                <td>{fmt(x.scheduledDate)}</td>
                <td>{fmt(x.date)}</td>
                <td>{companyName(data, x.companyId)}</td>
                <td>{cn(candidateOf(data, x.candidateId))}</td>
                <td>{x.type}</td>
                <td>
                  <Chip
                    text={x.status || "Depus"}
                    color={
                      x.status === "Depus" ? "green" : x.status === "Amânat" ? "yellow" : "blue"
                    }
                  />
                </td>
                <td className="btn-row">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => openModal("submissionEdit", x.id)}
                  >
                    Modifică
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void softDelete("submissions", x.id)}
                  >
                    Anulează
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PickupsView({
  data,
  filter,
  setFilter,
  openModal,
  softDelete,
}: {
  data: IgmData;
  filter: string;
  setFilter: (v: string) => void;
  openModal: (k: ModalKind, id?: string) => void;
  softDelete: (table: string, id: string) => Promise<void>;
}) {
  const arr = data.pickups.filter(
    (x) => active(x) && matchFilter(filter, companyName(data, x.companyId), x.notes),
  );
  return (
    <>
      <div className="igm-toolbar">
        <button type="button" className="btn" onClick={() => openModal("pickup")}>
          ＋ Înregistrează ridicare
        </button>
        <input
          className="igm-input narrow"
          placeholder="Caută…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="card-plain">
        <h2>Ridicări IGM</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Companie</th>
              <th>Documente</th>
              <th>Total</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {arr.map((x) => {
              const items = data.pickupItems.filter((i) => i.pickupId === x.id);
              return (
                <tr key={x.id}>
                  <td>{fmt(x.date)}</td>
                  <td>{companyName(data, x.companyId)}</td>
                  <td>{items.map((i) => `${i.type}: ${i.quantity}`).join(" · ")}</td>
                  <td>{items.reduce((n, i) => n + Number(i.quantity || 0), 0)}</td>
                  <td className="btn-row">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => openModal("pickupEdit", x.id)}
                    >
                      Modifică
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void softDelete("pickups", x.id)}
                    >
                      Anulează
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TransfersView({
  data,
  openModal,
}: {
  data: IgmData;
  openModal: (k: ModalKind) => void;
}) {
  return (
    <>
      <div className="igm-toolbar">
        <button type="button" className="btn" onClick={() => openModal("transfer")}>
          ＋ Transferă candidat
        </button>
      </div>
      <div className="card-plain">
        <h2>Istoric schimbări candidați</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Candidat</th>
              <th>De la</th>
              <th>La</th>
              <th>Operat de</th>
              <th>Observații</th>
            </tr>
          </thead>
          <tbody>
            {[...data.transfers].map((x) => (
              <tr key={x.id}>
                <td>{fmt(x.effectiveDate)}</td>
                <td>{cn(candidateOf(data, x.candidateId))}</td>
                <td>{companyName(data, x.fromCompanyId)}</td>
                <td>{companyName(data, x.toCompanyId)}</td>
                <td>{x.changedBy}</td>
                <td>{x.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AlertsView({
  data,
  openModal,
  softDelete,
  onMarkSeen,
  canMark,
}: {
  data: IgmData;
  openModal: (k: ModalKind, id?: string, t?: string) => void;
  softDelete: (table: string, id: string) => Promise<void>;
  onMarkSeen: () => void;
  canMark: boolean;
}) {
  const arr = activeDocs(data)
    .filter(
      (x) =>
        x.type !== "Pasaport Nepal" &&
        x.expiryDate &&
        (daysUntil(x.expiryDate) ?? 999) <= 90,
    )
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  return (
    <>
      <div className="igm-toolbar end">
        <button type="button" className="btn" disabled={!canMark} onClick={onMarkSeen}>
          ✓ Marchează toate ca văzute
        </button>
      </div>
      <div className="card-plain">
        <h2>Alerte documente și termene</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Candidat</th>
              <th>Companie</th>
              <th>Tip</th>
              <th>Număr</th>
              <th>Expiră</th>
              <th>Zile</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {arr.map((x) => {
              const d = daysUntil(x.expiryDate);
              return (
                <tr key={x.id}>
                  <td>{cn(candidateOf(data, x.candidateId))}</td>
                  <td>{companyName(data, x.companyId)}</td>
                  <td>{x.type}</td>
                  <td>{x.number}</td>
                  <td>{fmt(x.expiryDate)}</td>
                  <td>
                    <Chip text={`${d} zile`} color={zone(d)} />
                  </td>
                  <td className="btn-row">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => openModal("documentEdit", x.id, x.type)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void softDelete("documents", x.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ReportsView({ data }: { data: IgmData }) {
  return (
    <div className="card-plain">
      <h2>Rapoarte operaționale</h2>
      <p>Candidați activi: {activePeople(data).length}</p>
      <p>Candidați arhivați: {data.candidates.filter((x) => x.deletedAt).length}</p>
      <p>Documente active: {activeDocs(data).length}</p>
      <p>Dosare IGM: {data.submissions.filter(active).length}</p>
      <p>Ridicări IGM: {data.pickups.filter(active).length}</p>
      <p>Transferuri: {data.transfers.length}</p>
      <p className="hint">Date din baza locală sql.js pe host (fără Google Sheets).</p>
    </div>
  );
}

function IgmModal({
  kind,
  editId,
  presetType,
  data,
  formError,
  busy,
  onClose,
  onSubmit,
}: {
  kind: Exclude<ModalKind, null>;
  editId: string;
  presetType: string;
  data: IgmData;
  formError: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const company = data.companies.find((c) => c.id === editId);
  const candidate = data.candidates.find((c) => c.id === editId);
  const document = data.documents.find((d) => d.id === editId);
  const submission = data.submissions.find((s) => s.id === editId);
  const pickup = data.pickups.find((p) => p.id === editId);

  const [docType, setDocType] = useState(document?.type || presetType || "Invitatie");
  const [newMode, setNewMode] = useState(false);
  const [pickedCandidate, setPickedCandidate] = useState("");
  const [candQuery, setCandQuery] = useState("");
  const [pickupItems, setPickupItems] = useState([{ type: "Invitatii", quantity: 1 }]);
  const [batchGroups, setBatchGroups] = useState([
    {
      companyId: "",
      newCompanyName: "",
      people: [{ candidateId: "", newFirstName: "", newLastName: "", number: "" }],
    },
  ]);

  const titleMap: Record<string, string> = {
    company: "Adaugă companie",
    companyEdit: "Modifică companie",
    candidate: "Adaugă candidat",
    candidateEdit: "Modifică candidat",
    archive: `Arhivează candidat — ${cn(candidate)}`,
    transfer: "Transfer candidat",
    document: `Adaugă document`,
    documentEdit: `Modifică document`,
    submission: "Programează / depune dosar la IGM",
    submissionEdit: "Modifică dosar IGM",
    pickup: "Înregistrează ridicare IGM",
    pickupEdit: "Modifică ridicare IGM",
    batch: "Adaugă caziere — depunere în lot",
  };

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries()) as Record<string, unknown>;

    if (kind === "transfer") {
      if (!pickedCandidate) return;
      body.candidateId = pickedCandidate;
    }
    if (["document", "submission"].includes(kind) && !editId) {
      body.candidateId = newMode ? "" : pickedCandidate;
      if (!newMode) {
        delete body.newFirstName;
        delete body.newLastName;
      }
      if (!newMode && !pickedCandidate) return;
    }
    if (kind === "pickup") body.items = pickupItems;
    if (kind === "batch") body.groups = batchGroups;
    if (kind === "document" || kind === "documentEdit") body.type = docType;
    onSubmit(body);
  }

  const candResults = useMemo(() => {
    const terms = normSearch(candQuery).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return activePeople(data)
      .filter((c) => {
        const hay = normSearch(`${c.firstName} ${c.lastName} ${c.id} ${companyName(data, c.companyId)}`);
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 40);
  }, [candQuery, data]);

  const companyOptions = activeCompanies(data);

  return (
    <div className="igm-modalbg" role="dialog" aria-modal="true">
      <div className="igm-modal">
        <div className="igm-modalhead">
          <h2>{titleMap[kind]}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="igm-formgrid" onSubmit={handleSubmit}>
          {(kind === "company" || kind === "companyEdit") && (
            <label className="wide">
              Denumirea companiei *
              <input name="name" required defaultValue={company?.name || ""} />
            </label>
          )}

          {(kind === "candidate" || kind === "candidateEdit") && (
            <>
              <label>
                Prenume *
                <input name="firstName" required defaultValue={candidate?.firstName || ""} />
              </label>
              <label>
                Nume *
                <input name="lastName" required defaultValue={candidate?.lastName || ""} />
              </label>
              {kind === "candidate" ? (
                <label>
                  Companie
                  <select name="companyId" defaultValue="">
                    <option value="">Selectează compania</option>
                    {companyOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <input type="hidden" name="companyId" value={candidate?.companyId || ""} />
              )}
              <label>
                Status *
                <select name="status" defaultValue={candidate?.status || "Activ"}>
                  <option>Activ</option>
                  <option>În procesare</option>
                  <option>Inactiv</option>
                </select>
              </label>
              <label className="wide">
                Observații
                <textarea name="notes" defaultValue={candidate?.notes || ""} />
              </label>
            </>
          )}

          {kind === "archive" && (
            <>
              <label className="wide">
                Motivul arhivării *
                <input name="reason" required />
              </label>
              <label>
                Ultima zi de muncă *
                <input name="lastWorkDate" type="date" required defaultValue={today()} />
              </label>
            </>
          )}

          {(kind === "document" || kind === "submission") && !editId && (
            <>
              <div className="wide igm-group">
                <strong>Companie</strong>
                <div className="igm-formgrid">
                  <label>
                    Companie existentă
                    <select name="companyId" defaultValue="">
                      <option value="">Selectează compania</option>
                      {companyOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sau creează companie nouă
                    <input name="newCompanyName" />
                  </label>
                </div>
              </div>
              <div className="wide igm-group">
                <strong>Candidat</strong>
                <div className="btn-row" style={{ marginBottom: 8 }}>
                  <label>
                    <input
                      type="radio"
                      checked={!newMode}
                      onChange={() => setNewMode(false)}
                    />{" "}
                    Existent
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={newMode}
                      onChange={() => {
                        setNewMode(true);
                        setPickedCandidate("");
                      }}
                    />{" "}
                    Nou
                  </label>
                </div>
                {!newMode ? (
                  <>
                    <input
                      placeholder="Caută după nume…"
                      value={candQuery}
                      onChange={(e) => setCandQuery(e.target.value)}
                    />
                    <div className="igm-picker">
                      {candResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="igm-pickitem"
                          onClick={() => {
                            setPickedCandidate(c.id);
                            setCandQuery(cn(c));
                          }}
                        >
                          <strong>{cn(c)}</strong>
                          <small>
                            {companyName(data, c.companyId)} · {c.id}
                          </small>
                        </button>
                      ))}
                    </div>
                    <p className="hint">
                      {pickedCandidate
                        ? `Selectat: ${cn(candidateOf(data, pickedCandidate))}`
                        : "Selectează un candidat din rezultate"}
                    </p>
                  </>
                ) : (
                  <div className="igm-formgrid">
                    <label>
                      Prenume
                      <input name="newFirstName" />
                    </label>
                    <label>
                      Nume
                      <input name="newLastName" />
                    </label>
                  </div>
                )}
              </div>
            </>
          )}

          {kind === "transfer" && (
            <>
              <div className="wide igm-group">
                <strong>Candidat existent</strong>
                <input
                  placeholder="Caută după nume…"
                  value={candQuery}
                  onChange={(e) => setCandQuery(e.target.value)}
                />
                <div className="igm-picker">
                  {candResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="igm-pickitem"
                      onClick={() => {
                        setPickedCandidate(c.id);
                        setCandQuery(cn(c));
                      }}
                    >
                      <strong>{cn(c)}</strong>
                      <small>
                        {companyName(data, c.companyId)} · {c.id}
                      </small>
                    </button>
                  ))}
                </div>
                <p className="hint">
                  {pickedCandidate
                    ? `Selectat: ${cn(candidateOf(data, pickedCandidate))}`
                    : "Selectează candidatul de transferat"}
                </p>
              </div>
              <label>
                Companie nouă *
                <select name="toCompanyId" required defaultValue="">
                  <option value="">Selectează</option>
                  {companyOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Data transferului *
                <input name="effectiveDate" type="date" required defaultValue={today()} />
              </label>
              <label className="wide">
                Observații
                <textarea name="notes" />
              </label>
            </>
          )}

          {(kind === "document" || kind === "documentEdit") && (
            <>
              {document ? (
                <p className="wide hint">
                  Candidat: {cn(candidateOf(data, document.candidateId))} ·{" "}
                  {companyName(data, document.companyId)}
                </p>
              ) : null}
              <label className="wide">
                Tip document *
                <select value={docType} onChange={(e) => setDocType(e.target.value)} required>
                  {[
                    "Invitatie",
                    "Decizie",
                    "Permis de sedere",
                    "Cazier",
                    "Pasaport Nepal",
                    "Alt document",
                  ].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Număr document
                <input name="number" defaultValue={document?.number || ""} />
              </label>
              {docType === "Pasaport Nepal" ? (
                <>
                  <label>
                    Tracking UPS *
                    <input
                      name="trackingNumber"
                      required
                      defaultValue={document?.trackingNumber || ""}
                    />
                  </label>
                  <label>
                    Data trimiterii *
                    <input
                      name="sentDate"
                      type="date"
                      required
                      defaultValue={document?.sentDate || today()}
                    />
                  </label>
                  <label>
                    Data emiterii (opțional)
                    <input name="issueDate" type="date" defaultValue={document?.issueDate || ""} />
                  </label>
                  <label>
                    Data expirării (opțional)
                    <input
                      name="expiryDate"
                      type="date"
                      defaultValue={document?.expiryDate || ""}
                    />
                  </label>
                  <label>
                    Data livrării (opțional)
                    <input
                      name="deliveryDate"
                      type="date"
                      defaultValue={document?.deliveryDate || ""}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Data emiterii *
                    <input
                      name="issueDate"
                      type="date"
                      required
                      defaultValue={document?.issueDate || today()}
                    />
                  </label>
                  <label>
                    Data expirării
                    <input
                      name="expiryDate"
                      type="date"
                      defaultValue={document?.expiryDate || ""}
                    />
                  </label>
                  <label>
                    Alertă (zile)
                    <input
                      name="alertDays"
                      type="number"
                      min={0}
                      max={365}
                      defaultValue={document?.alertDays || "30"}
                    />
                  </label>
                </>
              )}
              <label className="wide">
                Observații
                <textarea name="notes" defaultValue={document?.notes || ""} />
              </label>
            </>
          )}

          {(kind === "submission" || kind === "submissionEdit") && (
            <>
              {submission ? (
                <p className="wide hint">
                  {companyName(data, submission.companyId)} ·{" "}
                  {cn(candidateOf(data, submission.candidateId))}
                </p>
              ) : null}
              <label>
                Tip dosar *
                <select name="type" required defaultValue={submission?.type || "Dosar invitatie"}>
                  <option value="Dosar invitatie">Dosar invitație</option>
                  <option value="Dosar decizie">Dosar decizie</option>
                  <option value="Invitatie + Decizie">Invitație + Decizie</option>
                  <option value="Alt dosar">Alt dosar</option>
                </select>
              </label>
              <label>
                Număr dosar
                <input name="number" defaultValue={submission?.number || ""} />
              </label>
              <label>
                Programare
                <input
                  name="scheduledDate"
                  type="date"
                  defaultValue={submission?.scheduledDate || ""}
                />
              </label>
              <label>
                Depunere efectivă
                <input name="date" type="date" defaultValue={submission?.date || ""} />
              </label>
              <label>
                Status *
                <select name="status" required defaultValue={submission?.status || "Programat"}>
                  <option>Programat</option>
                  <option>Depus</option>
                  <option>Amânat</option>
                  <option>Anulat</option>
                </select>
              </label>
              <label className="wide">
                Observații
                <textarea name="notes" defaultValue={submission?.notes || ""} />
              </label>
            </>
          )}

          {(kind === "pickup" || kind === "pickupEdit") && (
            <>
              {pickup ? (
                <p className="wide">{companyName(data, pickup.companyId)}</p>
              ) : (
                <label className="wide">
                  Companie *
                  <select name="companyId" required defaultValue="">
                    <option value="">Selectează</option>
                    {companyOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Data ridicării *
                <input name="date" type="date" required defaultValue={pickup?.date || today()} />
              </label>
              {kind === "pickup" ? (
                <div className="wide">
                  <h3>Documente ridicate</h3>
                  {pickupItems.map((item, idx) => (
                    <div className="igm-toolbar" key={idx}>
                      <select
                        value={item.type}
                        onChange={(e) => {
                          const next = [...pickupItems];
                          next[idx] = { ...next[idx], type: e.target.value };
                          setPickupItems(next);
                        }}
                      >
                        {[
                          "Invitatii",
                          "Decizii",
                          "Permise de sedere",
                          "Pasapoarte",
                          "Caziere",
                          "Altele",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={item.quantity}
                        onChange={(e) => {
                          const next = [...pickupItems];
                          next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                          setPickupItems(next);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setPickupItems(pickupItems.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setPickupItems([...pickupItems, { type: "Invitatii", quantity: 1 }])
                    }
                  >
                    ＋ Tip document
                  </button>
                </div>
              ) : null}
              <label className="wide">
                Observații
                <textarea name="notes" defaultValue={pickup?.notes || ""} />
              </label>
            </>
          )}

          {kind === "batch" && (
            <>
              <p className="wide hint">
                Completează o companie și fiecare candidat. Poți adăuga mai multe companii.
              </p>
              {batchGroups.map((g, i) => (
                <div className="wide igm-group" key={i}>
                  <h3>
                    Compania {i + 1} · {g.people.length} caziere
                  </h3>
                  <div className="igm-formgrid">
                    <label>
                      Companie existentă
                      <select
                        value={g.companyId}
                        onChange={(e) => {
                          const next = [...batchGroups];
                          next[i] = { ...next[i], companyId: e.target.value };
                          setBatchGroups(next);
                        }}
                      >
                        <option value="">Selectează</option>
                        {companyOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Sau companie nouă
                      <input
                        value={g.newCompanyName}
                        onChange={(e) => {
                          const next = [...batchGroups];
                          next[i] = { ...next[i], newCompanyName: e.target.value };
                          setBatchGroups(next);
                        }}
                      />
                    </label>
                  </div>
                  {g.people.map((p, j) => (
                    <div className="igm-group" key={j}>
                      <div className="igm-formgrid">
                        <label>
                          Candidat existent
                          <select
                            value={p.candidateId}
                            onChange={(e) => {
                              const next = [...batchGroups];
                              next[i].people[j] = {
                                ...next[i].people[j],
                                candidateId: e.target.value,
                              };
                              setBatchGroups(next);
                            }}
                          >
                            <option value="">Candidat nou / selectează</option>
                            {activePeople(data).map((c) => (
                              <option key={c.id} value={c.id}>
                                {cn(c)} — {companyName(data, c.companyId)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Prenume nou
                          <input
                            value={p.newFirstName}
                            onChange={(e) => {
                              const next = [...batchGroups];
                              next[i].people[j] = {
                                ...next[i].people[j],
                                newFirstName: e.target.value,
                              };
                              setBatchGroups(next);
                            }}
                          />
                        </label>
                        <label>
                          Nume nou
                          <input
                            value={p.newLastName}
                            onChange={(e) => {
                              const next = [...batchGroups];
                              next[i].people[j] = {
                                ...next[i].people[j],
                                newLastName: e.target.value,
                              };
                              setBatchGroups(next);
                            }}
                          />
                        </label>
                        <label>
                          Număr cazier
                          <input
                            value={p.number}
                            onChange={(e) => {
                              const next = [...batchGroups];
                              next[i].people[j] = { ...next[i].people[j], number: e.target.value };
                              setBatchGroups(next);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      const next = [...batchGroups];
                      next[i].people.push({
                        candidateId: "",
                        newFirstName: "",
                        newLastName: "",
                        number: "",
                      });
                      setBatchGroups(next);
                    }}
                  >
                    ＋ Adaugă candidat
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost wide"
                onClick={() =>
                  setBatchGroups([
                    ...batchGroups,
                    {
                      companyId: "",
                      newCompanyName: "",
                      people: [
                        { candidateId: "", newFirstName: "", newLastName: "", number: "" },
                      ],
                    },
                  ])
                }
              >
                ＋ Adaugă companie
              </button>
              <label>
                Data emiterii *
                <input name="issueDate" type="date" required defaultValue={today()} />
              </label>
              <label>
                Data expirării
                <input name="expiryDate" type="date" />
              </label>
              <label>
                Alertă (zile)
                <input name="alertDays" type="number" defaultValue={30} />
              </label>
              <label className="wide">
                Observații
                <textarea name="notes" />
              </label>
            </>
          )}

          {formError ? <p className="error wide">{formError}</p> : null}
          {kind === "transfer" && !pickedCandidate ? (
            <p className="hint wide">Selectează candidatul de transferat.</p>
          ) : null}
          {!newMode &&
          ["document", "submission"].includes(kind) &&
          !editId &&
          !pickedCandidate ? (
            <p className="hint wide">Selectează un candidat din rezultate sau alege „Nou”.</p>
          ) : null}

          <div className="igm-toolbar end wide">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Anulează
            </button>
            <button type="submit" className="btn" disabled={busy}>
              Salvează
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

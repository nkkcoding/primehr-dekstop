import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { getWsUrl } from "../../lib/api";
import {
  DOC_TYPE_BY_PAGE,
  IgmApi,
  type IgmCandidate,
  type IgmData,
  type IgmPageName,
} from "../../lib/igmApi";
import type { ShellOutletContext } from "../ShellPage";
import {
  CandidateDocsPanel,
  PipelineCompaniesView,
  PipelineCompanyPeopleView,
  PipelinePersonView,
} from "./PipelineViews";
import {
  IGM_NAV_PRIMARY,
  IGM_NAV_SECONDARY,
  PIPELINE_STEPS,
  companyStats,
  companyStatusCaption,
  delayedProcessPeople,
  inferPipelineStep,
  todoCompaniesNow,
  type PipelineStep,
} from "./pipeline";
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

type FocusHit = {
  kind: "candidate" | "company" | "document" | "submission";
  id: string;
};

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, onLogout } = useOutletContext<ShellOutletContext>();
  const [data, setData] = useState<IgmData>(emptyData());
  const [page, setPage] = useState<IgmPageName>(() => {
    const v = searchParams.get("v") || "";
    const known = [
      ...(IGM_NAV_PRIMARY as readonly string[]),
      ...(IGM_NAV_SECONDARY as readonly string[]),
    ];
    return known.includes(v) ? (v as IgmPageName) : "Dashboard";
  });
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const [focusHit, setFocusHit] = useState<FocusHit | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(today().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [editId, setEditId] = useState("");
  const [presetType, setPresetType] = useState("Invitatie");
  const [presetCandidateId, setPresetCandidateId] = useState("");
  const [formError, setFormError] = useState("");
  const [pipeCompanyId, setPipeCompanyId] = useState(() => searchParams.get("c") || "");
  const [pipeCandidateId, setPipeCandidateId] = useState(() => searchParams.get("p") || "");
  const [nightMode, setNightMode] = useState(() => {
    if (localStorage.getItem("primehr_ui_v") !== "soft-clean-b-1") {
      localStorage.setItem("primehr_ui_v", "soft-clean-b-1");
      localStorage.setItem("primehr_night", "0");
      return false;
    }
    return localStorage.getItem("primehr_night") === "1";
  });
  const [showMoreNav, setShowMoreNav] = useState(
    () => localStorage.getItem("primehr_more_nav") === "1",
  );

  useEffect(() => {
    localStorage.setItem("primehr_night", nightMode ? "1" : "0");
    document.documentElement.classList.toggle("night", nightMode);
    return () => document.documentElement.classList.remove("night");
  }, [nightMode]);

  const writeNavUrl = useCallback(
    (nextPage: IgmPageName, companyId = "", candidateId = "") => {
      const params: Record<string, string> = {};
      if (nextPage !== "Dashboard") params.v = nextPage;
      if (companyId) params.c = companyId;
      if (candidateId) params.p = candidateId;
      setSearchParams(params);
    },
    [setSearchParams],
  );

  const goPage = useCallback(
    (next: IgmPageName) => {
      setPage(next);
      setFilter("");
      setSelected("");
      setFocusHit(null);
      setPipeCompanyId("");
      setPipeCandidateId("");
      writeNavUrl(next, "", "");
    },
    [writeNavUrl],
  );

  const goFocus = useCallback(
    (next: IgmPageName, hit: FocusHit) => {
      setFilter("");
      setFocusHit(hit);
      if (hit.kind === "company") {
        setPage("Companii");
        setSelected("");
        setPipeCompanyId(hit.id);
        setPipeCandidateId("");
        writeNavUrl("Companii", hit.id, "");
        return;
      }
      if (hit.kind === "candidate") {
        setPage(next);
        setSelected(hit.id);
        setPipeCompanyId("");
        setPipeCandidateId("");
        writeNavUrl(next, "", "");
        return;
      }
      setPage(next);
      setSelected("");
      setPipeCompanyId("");
      setPipeCandidateId("");
      writeNavUrl(next, "", "");
    },
    [writeNavUrl],
  );

  useEffect(() => {
    if (!focusHit) return;
    const t = window.setTimeout(() => setFocusHit(null), 8000);
    return () => window.clearTimeout(t);
  }, [focusHit]);

  useEffect(() => {
    localStorage.setItem("primehr_more_nav", showMoreNav ? "1" : "0");
  }, [showMoreNav]);

  useEffect(() => {
    const secondary = IGM_NAV_SECONDARY as readonly string[];
    if (secondary.includes(page)) setShowMoreNav(true);
  }, [page]);

  const openCompanyNav = useCallback(
    (companyId: string, candidateId = "") => {
      setPage("Companii");
      setPipeCompanyId(companyId);
      setPipeCandidateId(candidateId);
      writeNavUrl("Companii", companyId, candidateId);
    },
    [writeNavUrl],
  );

  const navBack = useCallback(() => {
    if (pipeCandidateId) {
      setPipeCandidateId("");
      writeNavUrl("Companii", pipeCompanyId, "");
      return;
    }
    if (pipeCompanyId) {
      setPipeCompanyId("");
      setPipeCandidateId("");
      writeNavUrl("Companii", "", "");
      return;
    }
    goPage("Dashboard");
  }, [goPage, pipeCandidateId, pipeCompanyId, writeNavUrl]);

  useEffect(() => {
    const v = searchParams.get("v") || "Dashboard";
    const c = searchParams.get("c") || "";
    const p = searchParams.get("p") || "";
    setPage((prev) => (prev === v ? prev : (v as IgmPageName)));
    setPipeCompanyId((prev) => (prev === c ? prev : c));
    setPipeCandidateId((prev) => (prev === p ? prev : p));
  }, [searchParams]);

  const isBoss = user.role === "CEO" || user.role === "ADMIN";
  const roleBadge = isBoss ? "Șefă operațiuni" : "Angajat IGM";

  const pipeMode = page === "Companii";
  const hideDefaultHeader =
    pipeMode && (Boolean(pipeCompanyId) || Boolean(pipeCandidateId));

  const primaryNav = IGM_NAV_PRIMARY as readonly IgmPageName[];
  const secondaryNav = useMemo(
    () =>
      (IGM_NAV_SECONDARY as readonly IgmPageName[]).filter((p) => {
        if (!isBoss && p === "Candidați arhivați") return false;
        return true;
      }),
    [isBoss],
  );

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

  function openModal(kind: ModalKind, id = "", type = "Invitatie", candidateId = "") {
    setModal(kind);
    setEditId(id);
    setPresetType(type);
    setPresetCandidateId(candidateId);
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

  async function deleteCompany(companyId: string) {
    const company = data.companies.find((c) => c.id === companyId);
    const people = data.candidates.filter((c) => !c.deletedAt && c.companyId === companyId);
    const label = company?.name || "firma";
    const msg = people.length
      ? `Ștergi „${label}”? Se arhivează mai întâi ${people.length} candidat(ți), apoi firma.`
      : `Ștergi „${label}”?`;
    if (!window.confirm(msg)) return;
    const reason =
      window.prompt("Motivul ștergerii (obligatoriu):", "Șters din registru")?.trim() || "";
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      for (const person of people) {
        await IgmApi.archiveCandidate(person.id, reason, today());
      }
      await IgmApi.softDelete("companies", companyId, reason);
      await refresh();
      setPipeCompanyId("");
      setPipeCandidateId("");
      writeNavUrl("Companii", "", "");
      setFlash("Companie ștearsă");
      setTimeout(() => setFlash(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ștergere eșuată");
    } finally {
      setBusy(false);
    }
  }

  function archivePerson(candidateId: string) {
    openModal("archive", candidateId);
  }

  async function markAllSeen(cat: "alerts" | "archived") {
    const items = unseen(data, cat).map((x) => ({
      id: x.id,
      fingerprint: fingerprint(x, cat),
    }));
    if (!items.length) return;
    await run(() => IgmApi.markSeen(cat, items));
  }

  async function uploadCandidateFile(candidateId: string, file: File, docType: string) {
    const person = data.candidates.find((c) => c.id === candidateId);
    if (!person) throw new Error("Candidat inexistent");
    setBusy(true);
    setError(null);
    try {
      const passport = docType === "Pasaport Nepal";
      const created = await IgmApi.addDocument({
        type: docType,
        candidateId: person.id,
        companyId: person.companyId,
        issueDate: passport ? "" : today(),
        number: "",
        notes: `Atașat pe dosar · ${docType}`,
        alertDays: passport ? "" : 30,
        trackingNumber: passport ? `UP-${Date.now()}` : "",
        sentDate: passport ? today() : "",
      });
      await IgmApi.uploadFile(created.document.id, file);
      await refresh();
      setFlash("Document încărcat — vizibil pentru toți pe host");
      setTimeout(() => setFlash(null), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload eșuat";
      setError(msg);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function deleteCandidateFile(fileId: number) {
    setBusy(true);
    setError(null);
    try {
      await IgmApi.deleteFile(fileId);
      await refresh();
      setFlash("Fișier șters");
      setTimeout(() => setFlash(null), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ștergere eșuată";
      setError(msg);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="igm-root">
      <div className="igm-layout">
        <nav className="igm-nav" aria-label="Secțiuni IGM">
          <div className="igm-nav-brand">
            <span className="igm-brand-mark" aria-hidden>
              P
            </span>
            <div className="igm-brand-text">
              PrimeHR
              <small>Documente &amp; IGM</small>
            </div>
          </div>
          <div className="igm-nav-scroll">
            {primaryNav.map((p) => (
              <button
                key={p}
                type="button"
                className={`igm-nav-btn ${page === p ? "active" : ""}`}
                onClick={() => goPage(p)}
              >
                <span className="igm-nav-ico" aria-hidden>
                  <NavIcon name={p} />
                </span>
                <span className="igm-nav-label">{shortNavLabel(p)}</span>
                {p === "Alerte & Termene" && alertCount > 0 ? (
                  <span className="igm-badge">{alertCount}</span>
                ) : null}
              </button>
            ))}
            <div className="igm-nav-divider" />
            <button
              type="button"
              className={`igm-nav-btn igm-nav-more ${showMoreNav ? "open" : ""}`}
              onClick={() => setShowMoreNav((v) => !v)}
            >
              <span className="igm-nav-ico" aria-hidden>
                <NavIcon name="more" />
              </span>
              <span className="igm-nav-label">{showMoreNav ? "Mai puțin" : "Mai mult"}</span>
            </button>
            {showMoreNav
              ? secondaryNav.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`igm-nav-btn igm-nav-sub ${page === p ? "active" : ""}`}
                    onClick={() => goPage(p)}
                  >
                    <span className="igm-nav-label">{p}</span>
                    {p === "Candidați arhivați" && archivedUnseen > 0 ? (
                      <span className="igm-badge">{archivedUnseen}</span>
                    ) : null}
                  </button>
                ))
              : null}
          </div>
          <div className="igm-nav-foot">
            <div className="igm-nav-user">
              <span className="igm-user-avatar" aria-hidden>
                {(user.username || "U").slice(0, 1).toUpperCase()}
              </span>
              <div className="igm-nav-user-meta">
                <strong>{user.username || "admin"}</strong>
                <small>{roleBadge}</small>
              </div>
            </div>
            <button
              type="button"
              className="igm-logout-btn igm-logout-nav"
              onClick={() => {
                void onLogout().then(() => navigate("/login"));
              }}
            >
              Ieșire
            </button>
            <button
              type="button"
              className={`igm-night-btn ${nightMode ? "active" : ""}`}
              onClick={() => setNightMode((v) => !v)}
              title={nightMode ? "Mod zi" : "Night mode"}
            >
              {nightMode ? "Mod zi" : "Night mode"}
            </button>
          </div>
        </nav>

        <div className="igm-main">
          <header className={`igm-header ${hideDefaultHeader ? "igm-header-tools-only" : ""}`}>
            {!hideDefaultHeader ? (
              <div className="igm-header-title">
                <h1>{page === "Dashboard" ? "Astăzi" : page}</h1>
              </div>
            ) : (
              <div className="igm-header-title">
                <button type="button" className="igm-back-btn" onClick={navBack}>
                  ← Înapoi
                </button>
              </div>
            )}
            <div className="igm-header-tools">
              <label className="igm-header-search">
                <span className="igm-header-search-ico" aria-hidden>
                  ⌕
                </span>
                <input
                  type="search"
                  placeholder="Caută persoane, companii…"
                  value={globalQuery}
                  onChange={(e) => {
                    setGlobalQuery(e.target.value);
                    if (page !== "Căutare globală") goPage("Căutare globală");
                  }}
                  onFocus={() => {
                    if (page !== "Căutare globală") goPage("Căutare globală");
                  }}
                />
              </label>
            </div>
          </header>

          <div className="igm-body">
          {flash ? <div className="igm-flash">{flash}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          {busy && !modal ? <p className="hint">Se încarcă…</p> : null}

          {page === "Dashboard" ? (
            <DashboardView
              data={data}
              go={goPage}
              openCompany={(companyId, candidateId) => {
                openCompanyNav(companyId, candidateId || "");
              }}
              openModal={openModal}
            />
          ) : null}
          {page === "Calendar IGM" ? (
            <CalendarView
              data={data}
              month={calendarMonth}
              setMonth={setCalendarMonth}
              go={goPage}
            />
          ) : null}
          {page === "Căutare globală" ? (
            <GlobalSearchView
              data={data}
              query={globalQuery}
              setQuery={setGlobalQuery}
              goFocus={goFocus}
            />
          ) : null}
          {page === "Candidați" || page === "Candidați arhivați" ? (
            <PeopleView
              data={data}
              archived={page === "Candidați arhivați"}
              filter={filter}
              setFilter={setFilter}
              selected={selected}
              setSelected={(id) => {
                setFocusHit(null);
                setSelected(id);
              }}
              focusId={focusHit?.kind === "candidate" ? focusHit.id : ""}
              openModal={openModal}
              busy={busy}
              onUploadFile={(id, file, type) => uploadCandidateFile(id, file, type)}
              onDeleteFile={(fileId) => deleteCandidateFile(fileId)}
              onRestore={(id) => {
                if (window.confirm("Reactivăm candidatul în registru?")) {
                  void run(() => IgmApi.restoreCandidate(id));
                }
              }}
              onAssignToCompany={async (ids, companyId) => {
                await run(async () => {
                  for (const id of ids) {
                    const person = data.candidates.find((c) => c.id === id);
                    if (!person || person.companyId === companyId) continue;
                    await IgmApi.transfer({
                      candidateId: id,
                      toCompanyId: companyId,
                      effectiveDate: today(),
                      notes: companyId ? "Atribuire lot" : "Scoatere la Neatribuită",
                    });
                  }
                });
              }}
              onMarkSeen={() => void markAllSeen("archived")}
              unseenArchived={archivedUnseen}
            />
          ) : null}
          {page === "Companii" && !pipeCompanyId && !pipeCandidateId ? (
            <PipelineCompaniesView
              data={data}
              filter={filter}
              setFilter={setFilter}
              openModal={(k, id) => openModal(k, id)}
              onOpenCompany={(id) => openCompanyNav(id)}
              onDeleteCompany={(id) => void deleteCompany(id)}
            />
          ) : null}
          {page === "Companii" && pipeCompanyId && !pipeCandidateId ? (
            <PipelineCompanyPeopleView
              data={data}
              companyId={pipeCompanyId}
              openModal={(k, id) => openModal(k, id)}
              onBack={navBack}
              onOpenPerson={(id) => openCompanyNav(pipeCompanyId, id)}
              onDeleteCompany={(id) => void deleteCompany(id)}
              onArchivePerson={archivePerson}
            />
          ) : null}
          {page === "Companii" && pipeCandidateId ? (
            <PipelinePersonView
              data={data}
              candidateId={pipeCandidateId}
              busy={busy}
              onBackCompanies={() => {
                setPipeCompanyId("");
                setPipeCandidateId("");
                writeNavUrl("Companii", "", "");
              }}
              onBackCompany={() => {
                setPipeCandidateId("");
                writeNavUrl("Companii", pipeCompanyId, "");
              }}
              onAdvance={(step: PipelineStep) => {
                const person = data.candidates.find((c) => c.id === pipeCandidateId);
                if (!person) return;
                void run(() =>
                  IgmApi.updateCandidate(person.id, {
                    firstName: person.firstName,
                    lastName: person.lastName,
                    status: person.status,
                    notes: person.notes,
                    companyId: person.companyId,
                    pipelineStep: step,
                    pipelineDeadline: "",
                  }),
                );
              }}
              onRollback={(step: PipelineStep) => {
                const person = data.candidates.find((c) => c.id === pipeCandidateId);
                if (!person) return;
                void run(() =>
                  IgmApi.updateCandidate(person.id, {
                    firstName: person.firstName,
                    lastName: person.lastName,
                    status: person.status,
                    notes: person.notes,
                    companyId: person.companyId,
                    pipelineStep: step,
                    pipelineDeadline: "",
                  }),
                );
              }}
              onUpload={(file, docType) => uploadCandidateFile(pipeCandidateId, file, docType)}
              onDeleteFile={(fileId) => deleteCandidateFile(fileId)}
              onSetDeadline={(deadline) => {
                const person = data.candidates.find((c) => c.id === pipeCandidateId);
                if (!person) return;
                void run(() =>
                  IgmApi.updateCandidate(person.id, {
                    firstName: person.firstName,
                    lastName: person.lastName,
                    status: person.status,
                    notes: person.notes,
                    companyId: person.companyId,
                    pipelineStep: person.pipelineStep,
                    pipelineDeadline: deadline,
                  }),
                );
              }}
              onCreatePickup={async (body) => {
                setBusy(true);
                setError(null);
                try {
                  await IgmApi.addPickup(body);
                  await refresh();
                  setFlash("Ridicare înregistrată");
                  setTimeout(() => setFlash(null), 2000);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Ridicare eșuată";
                  setError(msg);
                  throw err;
                } finally {
                  setBusy(false);
                }
              }}
              onArchive={() => {
                if (pipeCandidateId) archivePerson(pipeCandidateId);
              }}
            />
          ) : null}
          {DOC_TYPE_BY_PAGE[page] ? (
            <DocumentsView
              data={data}
              type={DOC_TYPE_BY_PAGE[page]!}
              page={page}
              filter={filter}
              setFilter={setFilter}
              focusId={focusHit?.kind === "document" ? focusHit.id : ""}
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
              focusId={focusHit?.kind === "submission" ? focusHit.id : ""}
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
          </div>
        </div>
      </div>

      {modal ? (
        <IgmModal
          kind={modal}
          editId={editId}
          presetType={presetType}
          presetCompanyId={pipeCompanyId}
          presetCandidateId={presetCandidateId}
          data={data}
          formError={formError}
          busy={busy}
          onClose={() => {
            setModal(null);
            setPresetCandidateId("");
          }}
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
                  await IgmApi.addCandidate({
                    ...body,
                    pipelineStep: "Cerere firmă",
                    companyId: body.companyId || pipeCompanyId,
                  });
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
                  if (pipeCandidateId === editId) {
                    setPipeCandidateId("");
                    writeNavUrl("Companii", pipeCompanyId, "");
                  }
                  if (selected === editId) setSelected("");
                  break;
                case "transfer":
                  await IgmApi.transfer(body);
                  break;
                case "document": {
                  const files = (body.__files as FileList | File[] | undefined) || [];
                  delete body.__files;
                  const created = await IgmApi.addDocument(body);
                  const list = files instanceof FileList ? Array.from(files) : files;
                  for (const file of list) {
                    await IgmApi.uploadFile(created.document.id, file);
                  }
                  break;
                }
                case "documentEdit": {
                  const files = (body.__files as FileList | File[] | undefined) || [];
                  delete body.__files;
                  await IgmApi.updateDocument(editId, body);
                  const list = files instanceof FileList ? Array.from(files) : files;
                  for (const file of list) {
                    await IgmApi.uploadFile(editId, file);
                  }
                  break;
                }
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

function shortNavLabel(p: IgmPageName): string {
  if (p === "Alerte & Termene") return "Alerte";
  return p;
}

function NavIcon({ name }: { name: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "Dashboard") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    );
  }
  if (name === "Companii") {
    return (
      <svg {...common}>
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6" />
      </svg>
    );
  }
  if (name === "Candidați") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="3" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a3 3 0 0 1 0 5.74" />
      </svg>
    );
  }
  if (name === "Alerte & Termene") {
    return (
      <svg {...common}>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10 21a2 2 0 0 0 4 0" />
      </svg>
    );
  }
  if (name === "Rapoarte") {
    return (
      <svg {...common}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 17V10" />
        <path d="M12 17V7" />
        <path d="M16 17v-4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function shortPipeLabel(step: PipelineStep): string {
  if (step === "Cerere firmă") return "Cerere";
  if (step === "Sosire Moldova") return "Sosire";
  if (step === "Contract semnat") return "Contract";
  return step;
}

function StatusPill({
  text,
  tone,
}: {
  text: string;
  tone: "red" | "green" | "blue";
}) {
  return <span className={`dash-pill dash-pill-${tone}`}>{text}</span>;
}

function firmStatusTone(caption: string): string {
  if (caption === "Completat") return "done";
  if (caption === "În lucru") return "work";
  if (caption.includes("întârziați")) return "late";
  if (caption.includes("de ridicat") || caption.includes("la IGM") || caption.includes("documentare")) {
    return "active";
  }
  return "muted";
}

function DashboardView({
  data,
  go,
  openCompany,
  openModal,
}: {
  data: IgmData;
  go: (p: IgmPageName) => void;
  openCompany: (companyId: string, candidateId?: string) => void;
  openModal: (kind: ModalKind, id?: string) => void;
}) {
  const late = delayedProcessPeople(data);
  const people = activePeople(data);
  const firms = activeCompanies(data);
  const expDocs = activeDocs(data).filter((x) => {
    if (!x.expiryDate || x.type === "Pasaport Nepal") return false;
    const d = daysUntil(x.expiryDate);
    return d !== null && d <= 30;
  });

  const stepCounts = PIPELINE_STEPS.map((step) => ({
    step,
    count: people.filter((c) => inferPipelineStep(data, c) === step).length,
  }));
  const hotStep =
    stepCounts.slice(0, -1).sort((a, b) => b.count - a.count)[0]?.step || "Documentare";

  const todoRows = todoCompaniesNow(data).slice(0, 8);

  const companyRows = firms
    .map((f) => {
      const st = companyStats(data, f.id);
      const members = people.filter((c) => c.companyId === f.id);
      const avg =
        members.length === 0
          ? 0
          : members.reduce((sum, c) => sum + PIPELINE_STEPS.indexOf(inferPipelineStep(data, c)), 0) /
            members.length;
      const raw = Math.round((avg / Math.max(1, PIPELINE_STEPS.length - 1)) * 100);
      const progress =
        st.total === 0 ? 0 : st.done === st.total ? 100 : Math.min(100, Math.max(8, raw));
      return { f, st, progress, caption: companyStatusCaption(st) };
    })
    .sort((a, b) => b.st.late - a.st.late || b.st.active - a.st.active || b.st.total - a.st.total)
    .slice(0, 8);

  const upcoming = buildUpcoming(data).slice(0, 8);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const key = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    const items = upcoming.filter((x) => x.date === key);
    return {
      key,
      label: d.toLocaleDateString("ro-RO", { weekday: "short", day: "2-digit" }),
      items,
    };
  });

  const inFlux = people.filter((c) => inferPipelineStep(data, c) !== "Finalizat").length;

  return (
    <div className="dash-ops">
      <section className="dash-metrics" aria-label="Indicatori">
        <div className="dash-metric">
          <strong>{people.length}</strong>
          <span>Candidați activi</span>
          <em className="mint">în registru</em>
        </div>
        <div className="dash-metric">
          <strong>{firms.length}</strong>
          <span>Companii</span>
          <em>active</em>
        </div>
        <div className="dash-metric">
          <strong>{late.length}</strong>
          <span>Întârziați</span>
          <em className={late.length ? "warn" : "mint"}>{late.length ? "termen proces" : "la zi"}</em>
        </div>
        <button type="button" className="dash-metric dash-metric-btn" onClick={() => go("Alerte & Termene")}>
          <strong>{expDocs.length}</strong>
          <span>Doc. ≤ 30z</span>
          <em className={expDocs.length ? "sky" : "mint"}>
            {expDocs[0] ? `${cn(candidateOf(data, expDocs[0].candidateId))} · ${expDocs[0].type}` : "nimic pe radar"}
          </em>
        </button>
      </section>

      <section className="dash-pipe" aria-label="Pipeline agregat">
        <div className="dash-pipe-top">
          <span className="dash-pipe-chip">{inFlux} în flux</span>
        </div>
        <div className="dash-pipe-flow" aria-hidden>
          <svg className="dash-pipe-ribbon" viewBox="0 0 700 56" preserveAspectRatio="none">
            <defs>
              <linearGradient id="dashPipeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(91,141,239,0.35)" />
                <stop offset="55%" stopColor="rgba(122,180,245,0.28)" />
                <stop offset="100%" stopColor="rgba(95,191,154,0.38)" />
              </linearGradient>
            </defs>
            <path
              d="M8 34 C 70 10, 120 52, 180 28 S 280 8, 340 30 S 460 54, 520 26 S 620 6, 692 30"
              fill="none"
              stroke="url(#dashPipeGrad)"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <path
              d="M8 34 C 70 10, 120 52, 180 28 S 280 8, 340 30 S 460 54, 520 26 S 620 6, 692 30"
              fill="none"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="dash-pipe-track">
          {stepCounts.map(({ step, count }) => {
            const hot = step === hotStep && step !== "Finalizat";
            const fin = step === "Finalizat" && count > 0;
            const empty = count === 0;
            return (
              <div
                key={step}
                className={`dash-pipe-step ${hot ? "hot" : ""} ${fin ? "fin" : ""} ${empty ? "empty" : ""}`}
              >
                <span className="dash-pipe-dot">{count}</span>
                <strong>{shortPipeLabel(step)}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <section className="dash-split">
        <div className="dash-panel dash-todo">
          <div className="dash-card-head">
            <h2>De făcut acum</h2>
            <span>
              {todoRows.length}/{Math.max(todoRows.length, 1)}
            </span>
          </div>
          {todoRows.length ? (
            todoRows.map(({ f, step, kind, active, late: lateN }) => (
              <button
                key={f.id}
                type="button"
                className={`dash-check-item ${kind}`}
                onClick={() => openCompany(f.id)}
              >
                <span className="dash-check-mark" aria-hidden>
                  {kind === "late" ? "!" : kind === "urgent" ? "•" : "○"}
                </span>
                <div>
                  <strong>{f.name}</strong>
                  <small>
                    {active} {active === 1 ? "candidat" : "candidați"} cu contract ·{" "}
                    {shortPipeLabel(step)}
                    {lateN ? ` · ${lateN} întârziați` : ""}
                  </small>
                </div>
                <StatusPill
                  text={kind === "late" ? "ÎNTÂRZIAT" : kind === "urgent" ? "URGENT" : "ÎN LUCRU"}
                  tone={kind === "late" ? "red" : kind === "urgent" ? "green" : "blue"}
                />
              </button>
            ))
          ) : (
            <p className="dash-empty">Nicio firmă cu contracte semnate în lucru.</p>
          )}
        </div>

        <div className="dash-panel dash-upcoming">
          <div className="dash-card-head">
            <h2>Urmează · 7 zile</h2>
            <button type="button" className="dash-link" onClick={() => go("Calendar IGM")}>
              Vezi calendarul →
            </button>
          </div>

          <div className="dash-week">
            {weekDays.map((day) => (
              <div key={day.key} className={`dash-week-day ${day.items.length ? "has" : ""}`}>
                <span className="dash-week-label">{day.label}</span>
                {day.items.length ? (
                  day.items.slice(0, 2).map((item, i) => (
                    <button
                      key={`${item.kind}-${i}`}
                      type="button"
                      className="dash-week-chip"
                      onClick={() => go(item.page)}
                      title={`${item.kind} · ${item.detail}`}
                    >
                      {item.kind.replace("Expirare ", "")}
                    </button>
                  ))
                ) : (
                  <span className="dash-week-empty">—</span>
                )}
              </div>
            ))}
          </div>

          <div className="dash-upcoming-list">
            {upcoming.length ? (
              upcoming.slice(0, 6).map((item, i) => (
                <button
                  key={`${item.date}-${item.kind}-${i}`}
                  type="button"
                  className="dash-upcoming-row"
                  onClick={() => go(item.page)}
                >
                  <span className="dash-upcoming-avatar" aria-hidden>
                    {item.detail.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{item.kind}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <em className={item.status === "Expirat" || item.status === "Urgent" ? "warn" : ""}>
                    {fmt(item.date)}
                  </em>
                </button>
              ))
            ) : (
              <p className="dash-empty">Nimic programat pe 7 zile.</p>
            )}
          </div>
        </div>
      </section>

      <section className="dash-panel dash-firms">
        <div className="dash-card-head">
          <h2>Companii</h2>
          <button type="button" className="dash-link" onClick={() => go("Companii")}>
            Toate →
          </button>
        </div>
        <div className="dash-firm-grid">
          {companyRows.length ? (
            companyRows.map(({ f, st, progress, caption }) => (
              <button key={f.id} type="button" className="dash-firm" onClick={() => openCompany(f.id)}>
                <div className="dash-firm-top">
                  <strong>{f.name}</strong>
                  <span>{st.total}</span>
                </div>
                <div className="dash-progress" aria-hidden>
                  <i style={{ width: `${progress}%` }} />
                </div>
                <small className={`dash-firm-status ${firmStatusTone(caption)}`}>{caption}</small>
              </button>
            ))
          ) : (
            <p className="dash-empty">Nicio companie.</p>
          )}
        </div>
      </section>

      <div className="dash-actions">
        <div className="dash-actions-btns">
          <button type="button" className="dash-action primary" onClick={() => openModal("company")}>
            + Companie
          </button>
          <button type="button" className="dash-action" onClick={() => openModal("candidate")}>
            + Candidat
          </button>
          <button type="button" className="dash-action" onClick={() => go("Alerte & Termene")}>
            Alerte
          </button>
          <button type="button" className="dash-action" onClick={() => go("Companii")}>
            Companii
          </button>
        </div>
        <div className="dash-actions-sep" aria-hidden />
        <div className="dash-actions-meta">
          <span className="dash-actions-label">Registru</span>
          <div className="dash-actions-chips">
            <span className="dash-chip sky">{people.length} candidați</span>
            <span className="dash-chip mint">{firms.length} companii</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function opsList(data: IgmData) {
  return buildUpcoming(data);
}

function buildUpcoming(data: IgmData) {
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

  data.pickups.filter(active).forEach((x) => {
    if (x.date) {
      list.push({
        date: x.date.slice(0, 10),
        kind: "Ridicare IGM",
        detail: `${companyName(data, x.companyId)}${x.notes ? ` · ${x.notes}` : ""}`,
        status: "Programat",
        page: "Ridicări de la IGM",
      });
    }
  });

  activeDocs(data).forEach((x) => {
    const d = daysUntil(x.expiryDate);
    if (x.expiryDate && x.type !== "Pasaport Nepal" && d !== null && d <= 45) {
      list.push({
        date: x.expiryDate,
        kind: `Expirare ${x.type}`,
        detail: `${cn(candidateOf(data, x.candidateId))} · ${companyName(data, x.companyId)}`,
        status: d < 0 ? "Expirat" : d <= 7 ? "Urgent" : "În termen",
        page: "Alerte & Termene",
      });
    }
  });

  activePeople(data).forEach((c) => {
    if (!c.pipelineDeadline) return;
    const d = daysUntil(c.pipelineDeadline);
    if (d === null || d > 21) return;
    list.push({
      date: c.pipelineDeadline.slice(0, 10),
      kind: "Termen proces",
      detail: `${cn(c)} · ${shortPipeLabel(inferPipelineStep(data, c))}`,
      status: d < 0 ? "Întârziat" : d <= 3 ? "Urgent" : "În lucru",
      page: "Companii",
    });
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

type SearchKind = "candidate" | "company" | "document" | "submission";

type SearchRow = {
  kind: SearchKind;
  title: string;
  detail: string;
  page: IgmPageName;
  focus: FocusHit;
  score: number;
};

function searchScore(haystack: string, terms: string[]): number | null {
  const n = normSearch(haystack);
  if (!terms.every((t) => n.includes(t))) return null;
  const joined = terms.join(" ");
  let score = 0;
  if (n === joined) score += 100;
  else if (n.startsWith(joined)) score += 70;
  for (const t of terms) {
    if (n === t) score += 40;
    else if (n.startsWith(t)) score += 25;
    else if (n.split(/\s+/).some((w) => w.startsWith(t))) score += 15;
    else score += 5;
  }
  score -= Math.min(n.length, 40) * 0.05;
  return score;
}

function GlobalSearchView({
  data,
  query,
  setQuery,
  goFocus,
}: {
  data: IgmData;
  query: string;
  setQuery: (q: string) => void;
  goFocus: (page: IgmPageName, hit: FocusHit) => void;
}) {
  const [kindFilter, setKindFilter] = useState<"all" | SearchKind>("all");
  const raw = query.trim();
  const q = normSearch(raw);
  const ready = q.length >= 2;

  const rows = useMemo(() => {
    if (!ready) return [] as SearchRow[];
    const terms = q.split(/\s+/).filter(Boolean);
    const out: SearchRow[] = [];

    activePeople(data).forEach((c) => {
      const title = cn(c);
      const detail = companyName(data, c.companyId);
      const score = searchScore(`${title} ${c.id} ${detail}`, terms);
      if (score === null) return;
      out.push({
        kind: "candidate",
        title,
        detail,
        page: "Candidați",
        focus: { kind: "candidate", id: c.id },
        score,
      });
    });

    activeCompanies(data).forEach((c) => {
      const score = searchScore(`${c.name} ${c.id}`, terms);
      if (score === null) return;
      out.push({
        kind: "company",
        title: c.name,
        detail: c.id,
        page: "Companii",
        focus: { kind: "company", id: c.id },
        score,
      });
    });

    activeDocs(data).forEach((d) => {
      const person = cn(candidateOf(data, d.candidateId));
      const company = companyName(data, d.companyId);
      const docLine = `${d.type} · ${d.number || "Fără număr"}`;
      const score = searchScore(
        `${person} ${company} ${d.number} ${d.trackingNumber} ${d.type}`,
        terms,
      );
      if (score === null) return;
      const section =
        (Object.entries(DOC_TYPE_BY_PAGE).find(([, t]) => t === d.type)?.[0] as IgmPageName) ||
        "Candidați";
      out.push({
        kind: "document",
        title: person,
        detail: `${docLine} · ${company}`,
        page: section,
        focus: { kind: "document", id: d.id },
        score,
      });
    });

    data.submissions.filter(active).forEach((x) => {
      const person = cn(candidateOf(data, x.candidateId));
      const company = companyName(data, x.companyId);
      const score = searchScore(`${person} ${company} ${x.type} ${x.number}`, terms);
      if (score === null) return;
      out.push({
        kind: "submission",
        title: x.type,
        detail: `${person} · ${company}`,
        page: "Dosare la IGM",
        focus: { kind: "submission", id: x.id },
        score,
      });
    });

    out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ro"));
    return out;
  }, [data, ready, q]);

  const counts = useMemo(() => {
    const c = { all: rows.length, candidate: 0, company: 0, document: 0, submission: 0 };
    for (const r of rows) c[r.kind] += 1;
    return c;
  }, [rows]);

  const visible = kindFilter === "all" ? rows : rows.filter((r) => r.kind === kindFilter);
  const groups: { kind: SearchKind; label: string; items: SearchRow[] }[] = [
    { kind: "candidate", label: "Candidați", items: [] },
    { kind: "document", label: "Documente", items: [] },
    { kind: "company", label: "Companii", items: [] },
    { kind: "submission", label: "Dosare IGM", items: [] },
  ];
  for (const r of visible.slice(0, 120)) {
    const g = groups.find((x) => x.kind === r.kind);
    if (g) g.items.push(r);
  }
  const shownGroups = groups.filter((g) => g.items.length);

  const chips: { id: "all" | SearchKind; label: string; count: number }[] = [
    { id: "all", label: "Toate", count: counts.all },
    { id: "candidate", label: "Candidați", count: counts.candidate },
    { id: "document", label: "Documente", count: counts.document },
    { id: "company", label: "Companii", count: counts.company },
    { id: "submission", label: "Dosare IGM", count: counts.submission },
  ];

  return (
    <div className="card-plain search-board">
      <h2>Căutare globală</h2>
      <input
        className="igm-input"
        placeholder="Nume, prenume, companie, număr document, UPS…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {!raw ? (
        <p className="hint">Minim 2 caractere · rezultatele apar grupate pe tip.</p>
      ) : !ready ? (
        <p className="hint">Mai scrie încă un caracter ca să pornească căutarea.</p>
      ) : (
        <>
          <div className="search-chips" role="tablist" aria-label="Filtre tip">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={kindFilter === chip.id}
                className={`search-chip ${kindFilter === chip.id ? "on" : ""}`}
                onClick={() => setKindFilter(chip.id)}
              >
                {chip.label} <em>({chip.count})</em>
              </button>
            ))}
          </div>
          <p className="hint">
            {visible.length} rezultate
            {visible.length > 120 ? " (primele 120)" : ""} · sortate după relevanță
          </p>
          {shownGroups.length ? (
            <div className="search-groups">
              {shownGroups.map((g) => (
                <section key={g.kind} className="search-group">
                  <header className="search-group-head">
                    <strong>
                      {g.label} · {g.items.length}
                    </strong>
                  </header>
                  <ul className="search-list">
                    {g.items.map((r) => (
                      <li key={`${r.focus.kind}-${r.focus.id}`}>
                        <div className="search-hit">
                          <div>
                            <strong>{r.title}</strong>
                            <small>{r.detail}</small>
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => goFocus(r.page, r.focus)}
                          >
                            Vezi
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <p className="hint">Niciun rezultat pentru filtrul selectat.</p>
          )}
        </>
      )}
    </div>
  );
}

const PEOPLE_DOC_COLS: { type: string; short: string }[] = [
  { type: "Contract", short: "Contr" },
  { type: "Invitatie", short: "Inv" },
  { type: "Decizie", short: "Dec" },
  { type: "Permis de sedere", short: "Perm" },
  { type: "Cazier", short: "Caz" },
  { type: "Pasaport Nepal", short: "Pas" },
];

function personDocState(
  data: IgmData,
  candidateId: string,
  type: string,
): "ok" | "partial" | "miss" {
  const docs = data.documents.filter((d) => active(d) && d.candidateId === candidateId && d.type === type);
  if (!docs.length) return "miss";
  const ids = new Set(docs.map((d) => d.id));
  if (data.files.some((f) => ids.has(f.documentId))) return "ok";
  return "partial";
}

function PeopleView({
  data,
  archived,
  filter,
  setFilter,
  selected,
  setSelected,
  focusId,
  openModal,
  busy,
  onUploadFile,
  onDeleteFile,
  onRestore,
  onAssignToCompany,
  onMarkSeen,
  unseenArchived,
}: {
  data: IgmData;
  archived: boolean;
  filter: string;
  setFilter: (v: string) => void;
  selected: string;
  setSelected: (v: string) => void;
  focusId: string;
  openModal: (k: ModalKind, id?: string, type?: string, candidateId?: string) => void;
  busy: boolean;
  onUploadFile: (candidateId: string, file: File, docType: string) => Promise<void>;
  onDeleteFile: (fileId: number) => Promise<void>;
  onRestore: (id: string) => void;
  onAssignToCompany: (ids: string[], companyId: string) => Promise<void>;
  onMarkSeen: () => void;
  unseenArchived: number;
}) {
  const arr = data.candidates.filter(
    (c) =>
      !!c.deletedAt === archived &&
      matchFilter(filter, cn(c), companyName(data, c.companyId), c.id),
  );
  const current = arr.find((x) => x.id === selected) || (archived ? arr[0] : undefined);

  const [picked, setPicked] = useState<string[]>([]);
  const [assignCo, setAssignCo] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [openCos, setOpenCos] = useState<string[]>([]);
  const peopInit = useRef(false);

  const companyGroups = useMemo(() => {
    if (archived) return [];
    const map = new Map<string, IgmCandidate[]>();
    for (const c of arr) {
      const key = c.companyId || "__none__";
      const list = map.get(key) || [];
      list.push(c);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        label: key === "__none__" ? "Neatribuită" : companyName(data, key),
        items: items.sort((a, b) => cn(a).localeCompare(cn(b), "ro")),
      }))
      .sort((a, b) => {
        if (a.key === "__none__") return -1;
        if (b.key === "__none__") return 1;
        return a.label.localeCompare(b.label, "ro");
      });
  }, [arr, archived, data]);

  useEffect(() => {
    if (archived) return;
    setOpenCos((prev) => {
      const still = prev.filter((k) => companyGroups.some((g) => g.key === k));
      if (still.length) return still;
      if (!peopInit.current && companyGroups[0]) {
        peopInit.current = true;
        return [companyGroups[0].key];
      }
      return still;
    });
  }, [archived, companyGroups]);

  useEffect(() => {
    if (!focusId) return;
    const person = data.candidates.find((c) => c.id === focusId);
    if (person) {
      const key = person.companyId || "__none__";
      setShowAll(false);
      setOpenCos((prev) => (prev.includes(key) ? prev : [...prev, key]));
      setSelected(focusId);
    }
    const t = window.setTimeout(() => {
      document
        .querySelector(`[data-person-id="${focusId}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusId, data.candidates, setSelected]);

  function toggleCo(key: string) {
    if (showAll) {
      setShowAll(false);
      setOpenCos(companyGroups.map((g) => g.key).filter((k) => k !== key));
      return;
    }
    setOpenCos((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function togglePick(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function togglePickGroup(ids: string[]) {
    setPicked((prev) => {
      const allOn = ids.every((id) => prev.includes(id));
      if (allOn) return prev.filter((id) => !ids.includes(id));
      return Array.from(new Set([...prev, ...ids]));
    });
  }

  async function doAssign() {
    if (!assignCo || !picked.length) return;
    const companyId = assignCo === "__none__" ? "" : assignCo;
    await onAssignToCompany(picked, companyId);
    setPicked([]);
    setAssignCo("");
  }

  if (archived) {
    return (
      <>
        <div className="igm-toolbar end">
          <button type="button" className="btn" disabled={!unseenArchived} onClick={onMarkSeen}>
            ✓ Marchează toate ca văzute
          </button>
        </div>
        <div className="igm-split">
          <div className="card-plain">
            <h2>Candidați arhivați ({arr.length})</h2>
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
                  data-person-id={c.id}
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
                busy={busy}
                onUploadFile={onUploadFile}
                onDeleteFile={onDeleteFile}
              />
            ) : (
              <p className="hint">Selectează un candidat.</p>
            )}
          </div>
        </div>
      </>
    );
  }

  const firms = activeCompanies(data);

  return (
    <>
      <div className="igm-toolbar">
        <button type="button" className="btn" onClick={() => openModal("candidate")}>
          ＋ Adaugă candidat
        </button>
        <input
          className="igm-input narrow"
          placeholder="Caută…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          type="button"
          className={`btn btn-ghost ${showAll ? "on" : ""}`}
          onClick={() => {
            if (showAll) {
              setShowAll(false);
              setOpenCos([]);
            } else {
              setShowAll(true);
            }
          }}
        >
          {showAll ? "Închide tot" : "Vezi tot"}
        </button>
        {picked.length ? (
          <>
            <select
              className="igm-input narrow"
              value={assignCo}
              onChange={(e) => setAssignCo(e.target.value)}
            >
              <option value="">Mută la…</option>
              <option value="__none__">Neatribuită</option>
              {firms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={!assignCo || busy}
              onClick={() => void doAssign()}
            >
              {assignCo === "__none__"
                ? `Scoate la Neatribuită (${picked.length})`
                : `Atribuie (${picked.length})`}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPicked([])}>
              Anulează
            </button>
          </>
        ) : null}
      </div>

      <div className="pass-board">
        <div className="pass-board-head">
          <h2>
            Candidați ({arr.length})
          </h2>
          <p className="hint">
            Grupat pe firmă — bifează și atribuie lotul când știi unde pleacă.
          </p>
        </div>
        {companyGroups.length ? (
          companyGroups.map((g) => {
            const open = showAll || openCos.includes(g.key);
            const groupIds = g.items.map((c) => c.id);
            const allPicked = groupIds.length > 0 && groupIds.every((id) => picked.includes(id));
            return (
              <section key={g.key} className={`pass-day ${open ? "open" : ""}`}>
                <button
                  type="button"
                  className="pass-day-toggle"
                  onClick={() => toggleCo(g.key)}
                  aria-expanded={open}
                >
                  <span className="pass-day-chevron" aria-hidden>
                    {open ? "▾" : "▸"}
                  </span>
                  <strong className="peop-co-name">{g.label}</strong>
                  <em>
                    {g.items.length} {g.items.length === 1 ? "candidat" : "candidați"}
                  </em>
                </button>
                {open ? (
                  <div className="pass-day-body">
                    <table className="table pass-day-table peop-board-table">
                      <thead>
                        <tr>
                          <th className="peop-check-col">
                            <input
                              type="checkbox"
                              checked={allPicked}
                              onChange={() => togglePickGroup(groupIds)}
                              aria-label="Selectează grupul"
                            />
                          </th>
                          <th>Candidat</th>
                          {PEOPLE_DOC_COLS.map((col) => (
                            <th key={col.type} className="peop-doc-col">
                              {col.short}
                            </th>
                          ))}
                          <th>Acțiuni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((c) => {
                          const hit = focusId === c.id || selected === c.id;
                          return (
                            <tr
                              key={c.id}
                              data-person-id={c.id}
                              className={hit ? "igm-row-focus" : undefined}
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  checked={picked.includes(c.id)}
                                  onChange={() => togglePick(c.id)}
                                  aria-label={`Selectează ${cn(c)}`}
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="peop-name-btn"
                                  onClick={() => setSelected(c.id)}
                                >
                                  {cn(c)}
                                </button>
                              </td>
                              {PEOPLE_DOC_COLS.map((col) => {
                                const st = personDocState(data, c.id, col.type);
                                return (
                                  <td key={col.type} className="peop-doc-col">
                                    <button
                                      type="button"
                                      className={`peop-doc-chip ${st}`}
                                      title={
                                        st === "ok"
                                          ? `${col.type}: depus`
                                          : st === "partial"
                                            ? `${col.type}: înregistrat, fără fișier`
                                            : `${col.type}: lipsește`
                                      }
                                      onClick={() => {
                                        setSelected(c.id);
                                        if (st !== "ok") {
                                          openModal("document", "", col.type, c.id);
                                        }
                                      }}
                                    >
                                      {st === "ok" ? "✓" : st === "partial" ? "·" : "–"}
                                    </button>
                                  </td>
                                );
                              })}
                              <td className="btn-row">
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  onClick={() => openModal("candidateEdit", c.id)}
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() => openModal("archive", c.id)}
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
                ) : null}
              </section>
            );
          })
        ) : (
          <p className="hint">Niciun candidat.</p>
        )}
      </div>

      {current && !archived ? (
        <div className="card-plain peop-detail-card">
          <PersonDetail
            data={data}
            c={current}
            openModal={openModal}
            onRestore={onRestore}
            busy={busy}
            onUploadFile={onUploadFile}
            onDeleteFile={onDeleteFile}
          />
        </div>
      ) : null}
    </>
  );
}

function PersonDetail({
  data,
  c,
  openModal,
  onRestore,
  busy,
  onUploadFile,
  onDeleteFile,
}: {
  data: IgmData;
  c: IgmCandidate;
  openModal: (k: ModalKind, id?: string, type?: string, candidateId?: string) => void;
  onRestore: (id: string) => void;
  busy: boolean;
  onUploadFile: (candidateId: string, file: File, docType: string) => Promise<void>;
  onDeleteFile: (fileId: number) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("Contract");
  const [uploadError, setUploadError] = useState<string | null>(null);
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
              Șterge
            </button>
          </>
        )}
      </div>
      {c.deletedAt ? (
        <p>
          Motiv: {c.archiveReason || "—"} · Ultima zi: {fmt(c.lastWorkDate)}
        </p>
      ) : null}

      {!c.deletedAt ? (
        <div style={{ marginBottom: 16 }}>
          <CandidateDocsPanel
            data={data}
            candidateId={c.id}
            busy={busy}
            defaultType={docType}
            onDefaultTypeChange={setDocType}
            onUpload={(file, type) => onUploadFile(c.id, file, type)}
            onDeleteFile={onDeleteFile}
            onAddDetailed={(type) => openModal("document", "", type, c.id)}
            uploadError={uploadError}
            setUploadError={setUploadError}
            fileRef={fileRef}
          />
        </div>
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
                    onClick={() => void deleteCompany(c.id)}
                  >
                    Șterge
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

function weekdayRo(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const name = new Date(iso + "T12:00:00").toLocaleDateString("ro-RO", { weekday: "long" });
  return name;
}

function DocumentsView({
  data,
  type,
  page,
  filter,
  setFilter,
  focusId,
  openModal,
  softDelete,
  onUpload,
}: {
  data: IgmData;
  type: string;
  page: string;
  filter: string;
  setFilter: (v: string) => void;
  focusId: string;
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
        x.sentDate,
      ),
  );
  const passport = type === "Pasaport Nepal";
  const addLabel =
    type === "Cazier"
      ? "Adaugă caziere (lot)"
      : type === "Pasaport Nepal"
        ? "Adaugă pașaport Nepal"
        : `Adaugă ${page.toLowerCase().replace(/ii$/, "ie").replace(/e$/, "ă") || "document"}`;

  const passportGroups = useMemo(() => {
    if (!passport) return [];
    const map = new Map<string, typeof arr>();
    for (const x of arr) {
      const key = x.sentDate?.slice(0, 10) || "fara-data";
      const list = map.get(key) || [];
      list.push(x);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({ date, items }));
  }, [arr, passport]);

  const [openDates, setOpenDates] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const passInit = useRef(false);

  useEffect(() => {
    if (!passport) return;
    setOpenDates((prev) => {
      const still = prev.filter((d) => passportGroups.some((g) => g.date === d));
      if (still.length) return still;
      if (!passInit.current && passportGroups[0]) {
        passInit.current = true;
        return [passportGroups[0].date];
      }
      return still;
    });
  }, [passport, passportGroups]);

  function toggleDate(date: string) {
    if (showAll) {
      setShowAll(false);
      setOpenDates(passportGroups.map((g) => g.date).filter((d) => d !== date));
      return;
    }
    setOpenDates((prev) => (prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]));
  }

  function toggleShowAll() {
    if (showAll) {
      setShowAll(false);
      setOpenDates([]);
      return;
    }
    setShowAll(true);
  }

  useEffect(() => {
    if (!focusId) return;
    if (passport) {
      const group = passportGroups.find((g) => g.items.some((x) => x.id === focusId));
      if (group) {
        setShowAll(false);
        setOpenDates((prev) => (prev.includes(group.date) ? prev : [...prev, group.date]));
      }
    }
    const t = window.setTimeout(() => {
      document
        .querySelector(`[data-doc-id="${focusId}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusId, passport, passportGroups]);

  function renderPassportRow(x: (typeof arr)[number]) {
    const files = data.files.filter((f) => f.documentId === x.id);
    return (
      <tr
        key={x.id}
        data-doc-id={x.id}
        className={focusId === x.id ? "igm-row-focus" : undefined}
      >
        <td>{cn(candidateOf(data, x.candidateId))}</td>
        <td>{companyName(data, x.companyId)}</td>
        <td>{x.number || "—"}</td>
        <td>{x.trackingNumber || "—"}</td>
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
  }

  if (passport) {
    return (
      <>
        <div className="igm-toolbar">
          <button
            type="button"
            className="btn"
            onClick={() => openModal("document", "", type)}
          >
            ＋ {addLabel}
          </button>
          <input
            className="igm-input narrow"
            placeholder="Caută…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            type="button"
            className={`btn btn-ghost ${showAll ? "on" : ""}`}
            onClick={toggleShowAll}
          >
            {showAll ? "Închide tot" : "Vezi tot"}
          </button>
        </div>
        <div className="pass-board">
          <div className="pass-board-head">
            <h2>
              {page} ({arr.length})
            </h2>
            <p className="hint">Grupat pe data trimiterii — click pe zi ca să vezi candidații.</p>
          </div>
          {passportGroups.length ? (
            passportGroups.map((g) => {
              const open = showAll || openDates.includes(g.date);
              const label =
                g.date === "fara-data"
                  ? "Fără dată trimitere"
                  : `${fmt(g.date)} · ${weekdayRo(g.date)}`;
              return (
                <section key={g.date} className={`pass-day ${open ? "open" : ""}`}>
                  <button
                    type="button"
                    className="pass-day-toggle"
                    onClick={() => toggleDate(g.date)}
                    aria-expanded={open}
                  >
                    <span className="pass-day-chevron" aria-hidden>
                      {open ? "▾" : "▸"}
                    </span>
                    <strong>{label}</strong>
                    <em>
                      {g.items.length}{" "}
                      {g.items.length === 1 ? "trimitere" : "trimiteri"}
                    </em>
                  </button>
                  {open ? (
                    <div className="pass-day-body">
                      <table className="table pass-day-table">
                        <thead>
                          <tr>
                            <th>Candidat</th>
                            <th>Companie</th>
                            <th>Nr. pașaport</th>
                            <th>Tracking UPS</th>
                            <th>Fișiere</th>
                            <th>Acțiuni</th>
                          </tr>
                        </thead>
                        <tbody>{g.items.map((x) => renderPassportRow(x))}</tbody>
                      </table>
                    </div>
                  ) : null}
                </section>
              );
            })
          ) : (
            <p className="hint">Niciun pașaport înregistrat.</p>
          )}
        </div>
      </>
    );
  }

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
        <p className="hint">
          Fiecare înregistrare e legată de candidat + companie — apare și pe dosarul din tab-ul Candidați.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Candidat</th>
              <th>Companie</th>
              <th>Număr</th>
              <th>Emitere</th>
              <th>Expirare</th>
              <th>Zile</th>
              <th>Fișiere</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {arr.map((x) => {
              const d = daysUntil(x.expiryDate);
              const files = data.files.filter((f) => f.documentId === x.id);
              return (
                <tr
                  key={x.id}
                  data-doc-id={x.id}
                  className={focusId === x.id ? "igm-row-focus" : undefined}
                >
                  <td>{cn(candidateOf(data, x.candidateId))}</td>
                  <td>{companyName(data, x.companyId)}</td>
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
  focusId,
  openModal,
  softDelete,
}: {
  data: IgmData;
  filter: string;
  setFilter: (v: string) => void;
  focusId: string;
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

  useEffect(() => {
    if (!focusId) return;
    const t = window.setTimeout(() => {
      document
        .querySelector(`[data-sub-id="${focusId}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [focusId]);

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
              <tr
                key={x.id}
                data-sub-id={x.id}
                className={focusId === x.id ? "igm-row-focus" : undefined}
              >
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
  presetCompanyId = "",
  presetCandidateId = "",
  data,
  formError,
  busy,
  onClose,
  onSubmit,
}: {
  kind: Exclude<ModalKind, null>;
  editId: string;
  presetType: string;
  presetCompanyId?: string;
  presetCandidateId?: string;
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
  const presetPerson = data.candidates.find((c) => c.id === presetCandidateId);

  const [docType, setDocType] = useState(document?.type || presetType || "Invitatie");
  const [newMode, setNewMode] = useState(
    () => !presetCandidateId && (document?.type || presetType) === "Pasaport Nepal",
  );
  const [pickedCandidate, setPickedCandidate] = useState(presetCandidateId || "");
  const [candQuery, setCandQuery] = useState("");
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const passportFlow = docType === "Pasaport Nepal";

  useEffect(() => {
    if (passportFlow && !presetPerson && !editId) {
      setNewMode(true);
      setPickedCandidate("");
    }
  }, [passportFlow, presetPerson, editId]);
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
    archive: `Arhivează candidat`,
    transfer: "Transfer candidat",
    document: `Adaugă document`,
    documentEdit: `Modifică document`,
    submission: "Programează dosar IGM",
    submissionEdit: "Modifică dosar IGM",
    pickup: "Înregistrează ridicare IGM",
    pickupEdit: "Modifică ridicare IGM",
    batch: "Adaugă caziere",
  };

  const subtitleMap: Record<string, string> = {
    company: "Denumirea firmei în registru",
    companyEdit: "Actualizează denumirea",
    candidate: "Leagă candidatul de o companie",
    candidateEdit: "Actualizează datele candidatului",
    archive: cn(candidate) || "Mută candidatul în arhivă",
    transfer: "Mută candidatul la altă firmă",
    document: "Companie, candidat și date document",
    documentEdit: "Actualizează datele documentului",
    submission: "Programare sau depunere la IGM",
    submissionEdit: "Actualizează dosarul IGM",
    pickup: "Ce ridici de la IGM",
    pickupEdit: "Actualizează ridicarea",
    batch: "Depunere în lot — companii și candidați",
  };

  const batchStats = {
    companies: batchGroups.length,
    records: batchGroups.reduce((n, g) => n + g.people.length, 0),
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
      const forceNewPassport = kind === "document" && passportFlow && !presetCandidateId;
      const useNew = forceNewPassport || newMode;
      body.candidateId = useNew ? "" : pickedCandidate;
      if (forceNewPassport) {
        delete body.companyId;
        delete body.newCompanyName;
      }
      if (!useNew) {
        delete body.newFirstName;
        delete body.newLastName;
      }
      if (!useNew && !pickedCandidate) return;
      if (!useNew && pickedCandidate) {
        const person = data.candidates.find((c) => c.id === pickedCandidate);
        if (person?.companyId) body.companyId = person.companyId;
      }
    }
    if (kind === "pickup") body.items = pickupItems;
    if (kind === "batch") body.groups = batchGroups;
    if (kind === "document" || kind === "documentEdit") {
      body.type = docType;
      if (docFiles.length) body.__files = docFiles;
    }
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
      <div className={`igm-modal ${kind === "batch" ? "igm-modal-lg" : ""}`}>
        <div className="igm-modalhead">
          <div>
            <h2>{titleMap[kind]}</h2>
            {subtitleMap[kind] ? <p className="igm-modalsub">{subtitleMap[kind]}</p> : null}
          </div>
          <button type="button" className="igm-modal-x" onClick={onClose} aria-label="Închide">
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
                  <select name="companyId" defaultValue={presetCompanyId || ""}>
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
              {presetPerson ? (
                <div className="wide igm-section">
                  <div className="igm-section-label">Legătură dosar</div>
                  <div className="igm-person-card">
                    <div className="igm-person-card-top">
                      <strong>{cn(presetPerson)}</strong>
                      <span className="igm-chip green">sincronizat</span>
                    </div>
                    <p className="hint" style={{ margin: 0 }}>
                      {companyName(data, presetPerson.companyId)} · {presetPerson.id}
                      <br />
                      Documentul apare automat la candidat și în tab-ul tipului (Invitații / Permise…).
                    </p>
                    <input type="hidden" name="companyId" value={presetPerson.companyId || ""} />
                  </div>
                </div>
              ) : passportFlow && kind === "document" ? (
                <div className="wide igm-section">
                  <div className="igm-section-label">Candidat nou</div>
                  <p className="hint" style={{ marginTop: 0 }}>
                    Pentru pașapoarte creezi doar candidatul. Compania și tracking-ul le poți adăuga
                    ulterior.
                  </p>
                  <div className="igm-formgrid">
                    <label>
                      Prenume *
                      <input name="newFirstName" required />
                    </label>
                    <label>
                      Nume *
                      <input name="newLastName" required />
                    </label>
                  </div>
                </div>
              ) : (
                <>
              <div className="wide igm-section">
                <div className="igm-section-label">Companie</div>
                <div className="igm-formgrid">
                  <label className="wide">
                    Selectează compania
                    <select name="companyId" defaultValue="">
                      <option value="">Selectează compania</option>
                      {companyOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="wide">
                    <span className="igm-or">sau creează una nouă</span>
                    <input name="newCompanyName" placeholder="Nume companie nouă" />
                  </label>
                </div>
              </div>
              <div className="wide igm-section">
                <div className="igm-section-label">Candidat</div>
                <div className="igm-seg">
                  <button
                    type="button"
                    className={!newMode ? "on" : ""}
                    onClick={() => setNewMode(false)}
                  >
                    Existent
                  </button>
                  <button
                    type="button"
                    className={newMode ? "on" : ""}
                    onClick={() => {
                      setNewMode(true);
                      setPickedCandidate("");
                    }}
                  >
                    Nou
                  </button>
                </div>
                {!newMode ? (
                  <>
                    <input
                      className="igm-search"
                      placeholder="Caută după nume…"
                      value={candQuery}
                      onChange={(e) => setCandQuery(e.target.value)}
                    />
                    <div className="igm-picker">
                      {candResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`igm-pickitem ${pickedCandidate === c.id ? "picked" : ""}`}
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
            </>
          )}

          {kind === "transfer" && (
            <>
              <div className="wide igm-section">
                <div className="igm-section-label">Candidat</div>
                <input
                  className="igm-search"
                  placeholder="Caută după nume…"
                  value={candQuery}
                  onChange={(e) => setCandQuery(e.target.value)}
                />
                <div className="igm-picker">
                  {candResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`igm-pickitem ${pickedCandidate === c.id ? "picked" : ""}`}
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
                    "Contract",
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
                {docType === "Invitatie"
                  ? "Număr invitație"
                  : docType === "Decizie"
                    ? "Număr decizie"
                    : docType === "Permis de sedere"
                      ? "Număr permis"
                      : "Număr document"}
                <input name="number" defaultValue={document?.number || ""} placeholder="ex. EB0000" />
              </label>
              {passportFlow ? (
                <>
                  <label>
                    Tracking UPS
                    <input
                      name="trackingNumber"
                      defaultValue={document?.trackingNumber || ""}
                      placeholder="Opțional — poți completa după trimitere"
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
              <label className="wide">
                {passportFlow
                  ? "Încarcă fișier (opțional)"
                  : kind === "document"
                    ? "Încarcă document (PDF/PNG) *"
                    : "Adaugă fișier (PDF/PNG)"}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*"
                  multiple
                  required={kind === "document" && !passportFlow}
                  onChange={(e) => setDocFiles(Array.from(e.target.files || []))}
                />
                <span className="hint">
                  {passportFlow
                    ? "Nu e obligatoriu — pașapoartele nu se scanează acum. Tracking-ul îl poți adăuga ulterior."
                    : "Fișierul apare la candidat și bifează verde tipul (Invitație / Decizie / Permis…)."}
                  {docFiles.length ? ` Selectat: ${docFiles.map((f) => f.name).join(", ")}` : ""}
                </span>
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
                <div className="wide igm-section">
                  <div className="igm-section-label">Documente ridicate</div>
                  {pickupItems.map((item, idx) => (
                    <div className="igm-person-card" key={idx}>
                      <div className="igm-formgrid">
                        <label>
                          Tip
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
                        </label>
                        <label>
                          Cantitate
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
                        </label>
                      </div>
                      {pickupItems.length > 1 ? (
                        <button
                          type="button"
                          className="igm-text-btn danger"
                          onClick={() => setPickupItems(pickupItems.filter((_, i) => i !== idx))}
                        >
                          Șterge
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="igm-text-btn"
                    onClick={() =>
                      setPickupItems([...pickupItems, { type: "Invitatii", quantity: 1 }])
                    }
                  >
                    + Tip document
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
              <div className="wide igm-chips">
                <span>{batchStats.companies} compani{batchStats.companies === 1 ? "e" : "i"}</span>
                <span>{batchStats.records} cazier{batchStats.records === 1 ? "" : "e"}</span>
              </div>
              {batchGroups.map((g, i) => (
                <div className="wide igm-section" key={i}>
                  <div className="igm-section-label">Companie {i + 1}</div>
                  <div className="igm-formgrid">
                    <label className="wide">
                      Selectează compania
                      <select
                        value={g.companyId}
                        onChange={(e) => {
                          const next = [...batchGroups];
                          next[i] = { ...next[i], companyId: e.target.value };
                          setBatchGroups(next);
                        }}
                      >
                        <option value="">Selectează compania</option>
                        {companyOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="wide">
                      <span className="igm-or">sau creează una nouă</span>
                      <input
                        value={g.newCompanyName}
                        placeholder="Nume companie nouă"
                        onChange={(e) => {
                          const next = [...batchGroups];
                          next[i] = { ...next[i], newCompanyName: e.target.value };
                          setBatchGroups(next);
                        }}
                      />
                    </label>
                  </div>

                  {g.people.map((p, j) => (
                    <div className="igm-person-card" key={j}>
                      <div className="igm-person-card-top">
                        <strong>Candidat {j + 1}</strong>
                        {g.people.length > 1 ? (
                          <button
                            type="button"
                            className="igm-text-btn danger"
                            onClick={() => {
                              const next = [...batchGroups];
                              next[i].people = next[i].people.filter((_, idx) => idx !== j);
                              setBatchGroups(next);
                            }}
                          >
                            Șterge
                          </button>
                        ) : null}
                      </div>
                      <div className="igm-formgrid">
                        <label className="wide">
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
                          Prenume
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
                          Nume
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
                        <label className="wide">
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
                    className="igm-text-btn"
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
                    + Adaugă candidat
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn btn-outline wide"
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
                + Adaugă companie
              </button>

              <div className="wide igm-section">
                <div className="igm-section-label">Date lot</div>
                <div className="igm-formgrid">
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
                </div>
              </div>
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

          <div className="igm-modalfoot wide">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Anulează
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {kind === "batch" ? "Salvează lotul" : "Salvează"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

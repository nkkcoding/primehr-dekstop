import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import {
  AuthApi,
  getStoredToken,
  loadConnectionConfig,
  setStoredToken,
  type User,
} from "./lib/api";
import type { ConnectionConfig } from "./vite-env";
import ModeSelectPage from "./pages/ModeSelectPage";
import LoginPage from "./pages/LoginPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import ShellPage from "./pages/ShellPage";
import CasesPage from "./pages/CasesPage";
import StubPage from "./pages/StubPage";
import IgmPage from "./pages/igm/IgmPage";

export default function App() {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await loadConnectionConfig();
        setConfig(cfg);
        const token = getStoredToken();
        if (token) {
          try {
            const me = await AuthApi.me();
            setUser(me.user);
          } catch {
            setStoredToken(null);
          }
        }
      } catch (err) {
        setBootError(err instanceof Error ? err.message : "Eroare la pornire");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <div className="app-center">
        <div className="panel">
          <h1 className="brand">PrimeHR Documents</h1>
          <p className="brand-sub">Se încarcă…</p>
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="app-center">
        <div className="panel">
          <div className="error">{bootError}</div>
        </div>
      </div>
    );
  }

  // Packaged Electron defaults to Host and skips setup on first PC.
  // Browser trial and Client mode still use /setup. Client mode remains available via shell.
  const electronHostReady =
    Boolean(window.primehr) &&
    config?.mode === "host" &&
    Boolean(config.hostUrl);
  const needsMode =
    !config ||
    (config.mode === "client" && !config.hostUrl) ||
    (localStorage.getItem("primehr_mode_chosen") !== "1" && !electronHostReady);

  return (
    <Routes>
      <Route
        path="/setup"
        element={
          <ModeSelectPage
            initial={config}
            onSaved={(next) => {
              setConfig(next);
              localStorage.setItem("primehr_mode_chosen", "1");
            }}
          />
        }
      />
      <Route
        path="/login"
        element={
          needsMode ? (
            <Navigate to="/setup" replace />
          ) : user ? (
            <Navigate to={user.mustChangePassword ? "/schimba-parola" : "/app"} replace />
          ) : (
            <LoginPage
              onLoggedIn={(u, token) => {
                setStoredToken(token);
                setUser(u);
              }}
            />
          )
        }
      />
      <Route
        path="/schimba-parola"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : (
            <ChangePasswordPage
              user={user}
              onChanged={(u) => setUser(u)}
            />
          )
        }
      />
      <Route
        path="/app"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : user.mustChangePassword ? (
            <Navigate to="/schimba-parola" replace />
          ) : (
            <ShellPage
              user={user}
              config={config!}
              onLogout={async () => {
                try {
                  await AuthApi.logout();
                } catch {
                  /* ignore */
                }
                setStoredToken(null);
                setUser(null);
              }}
              onOpenSetup={() => {
                localStorage.removeItem("primehr_mode_chosen");
              }}
            />
          )
        }
      >
        <Route
          index
          element={
            !user ? null : user.role === "IGM" || user.role === "ADMIN" || user.role === "CEO" ? (
              <Navigate to="/app/igm" replace />
            ) : (
              <StubPage
                title="Dashboard"
                text="Scaffold Manager: folosiți Cazuri. Modul IGM e pentru rolurile IGM / Admin."
              />
            )
          }
        />
        <Route path="cazuri" element={user ? <CasesPage user={user} /> : null} />
        <Route
          path="ceo"
          element={<StubPage title="CEO" text="Modul CEO — neportat încă (doar stub navigare)." />}
        />
        <Route path="igm" element={<IgmPage />} />
        <Route
          path="utilizatori"
          element={
            <StubPage title="Utilizatori" text="Administrare conturi — stub (doar Admin în navigare)." />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={user ? "/app" : needsMode ? "/setup" : "/login"} replace />} />
    </Routes>
  );
}

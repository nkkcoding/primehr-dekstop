# PrimeHR Documents — scaffold (Windows / LAN)

Aplicație trial pe PC local: același binariu pentru toți, cu roluri (Admin / Manager / CEO / IGM). Un PC din birou rulează ca **Host** (SQLite via sql.js + `uploads/` + API/WebSocket); celelalte ca **Client** pe LAN.

Stack gratuit: React + TypeScript + Express + **sql.js** + WebSocket + Electron (instalator `.exe`). Fără Google Sheets / Supabase în acest trial. **Fără compilare nativă** — `npm install` pe Windows curat nu necesită Python sau Visual Studio Build Tools.

## Cerințe

- **Node.js LTS** (20+; recomandat 22) — doar pe PC-ul care **construiește** instalatorul
- Utilizatorii din birou: doar instalatorul **`.exe`** (fără npm/terminal)
- Browser (Chrome/Edge) rămâne alternativă de dezvoltare: `npm run dev:host`

> ~~VS Build Tools / windows-build-tools~~ — **anulat.** Persistarea e `sql.js` (WASM), nu `better-sqlite3`.

## Conturi seed (schimbare parolă obligatorie la primul login)

| Utilizator | Parolă temporară | Rol    |
|------------|------------------|--------|
| `admin`    | `Admin123!@#`    | ADMIN  |
| `manager1` | `Manager123!@#`  | MANAGER|
| `igm1`     | `Igm123!@#`      | IGM    |

## Instalator Windows `.exe` (calea pentru birou)

Pe **un** PC Windows cu Node.js (ex. al lui Nicolae), din folderul proiectului:

**O singură comandă (dublu-click sau CMD):**

```bat
build-win.bat
```

sau echivalent:

```bat
npm config set ignore-scripts false
npm install
npm run build:win
```

Artefact: `release\PrimeHR-Documents-Setup-0.1.0.exe` (NSIS).

### Ce face instalatorul pe PC-ul Host

- La prima pornire rulează ca **Host** (implicit)
- SQLite + uploads în `%APPDATA%\PrimeHR Documents\primehr-data\`
- Modul **Client** rămâne disponibil din UI (Schimbă modul) pentru alte PC-uri pe LAN

Distribuiți `.exe`-ul pe celelalte PC-uri; acolo alegeți **Client** și URL-ul host-ului (ex. `http://192.168.1.20:3847`).

> Semnare digitală (code signing) **nu** este necesară pentru trial. Windows SmartScreen poate afișa un avertisment la primul run — alegeți „More info” → „Run anyway”.

### Dacă Electron postinstall a eșuat pe PC

```bat
npm config set ignore-scripts false
npm rebuild electron
node scripts\ensure-electron.cjs --strict
npm run build:win
```

Proiectul include `.npmrc` cu `ignore-scripts=false` și `scripts/ensure-electron.cjs` (repară binarul lipsă/incomplet).

## Pornire pe Windows (dezvoltare — fără `.exe`)

Din folderul proiectului (disc local NTFS):

```bat
cd %USERPROFILE%\Desktop\primehr-desktop
npm install
npm run smoke
npm run dev:host
```

Apoi deschideți în browser: **http://127.0.0.1:5173**

1. Alegeți **Host** (PC principal) sau **Client** (alt PC → URL host)
2. Login cu conturile seed de mai sus

`npm run dev:host` (= `dev:web`) pornește **doar** API pe **3847** + Vite pe **5173**.

### Electron în dezvoltare (opțional)

```bat
npm run ensure:electron
npm run dev:host:desktop
```

## Variante dezvoltare

| Comandă | Scop |
|---------|------|
| `npm run dev:host` / `dev:web` | API + Vite (browser) — recomandat |
| `npm run dev:host:desktop` | API + Vite + Electron |
| `npm run server:only` | doar API host |
| `npm run dev:client` | Vite Client în browser |
| `npm run build:win` | instalator NSIS Windows |
| `build-win.bat` | același build, dublu-click pe Windows |

## Ce funcționează acum

- Alegere mod Host / Client (în `.exe`, Host e implicit la prima pornire)
- Login + forțare schimbare parolă
- Shell pe rol: **Documente & IGM** (Admin / IGM / CEO), Cazuri (Manager/Admin), CEO/Utilizatori = stub
- **Modul IGM**: dashboard, candidați/companii, documente (invitații, decizii, permise, caziere, pașapoarte Nepal), dosare, ridicări, transferuri, alerte, căutare, calendar; soft-delete + audit; atașamente PDF/PNG pe host
- Creare + listare **caz** (titlu/status) în SQLite pe host (felie Manager)
- Upload PDF/PNG pe disc host; listare/descărcare de pe clienți
- Broadcast WebSocket `cases:changed` / `igm:changed` → clienții reîncarcă

## Date pe host

| Mediu | SQLite | Uploads |
|-------|--------|---------|
| Dev (`dev:host`) | `.data/primehr.db` | `uploads/` |
| Instalator `.exe` | `%APPDATA%\PrimeHR Documents\primehr-data\.data\` | `...\primehr-data\uploads\` |

## Porturi

| Serviciu        | Port |
|-----------------|------|
| API + WebSocket | 3847 |
| Vite (doar dev) | 5173 |

WebSocket: `ws://<host>:3847/ws`

## Comenzi utile

```bash
npm run typecheck
npm run smoke
npm run ensure:electron      # repară binarul Electron
npm run build                # UI + electron/server TS
npm run build:win            # NSIS .exe
```

## Înlocuire copie veche (Nicolae)

Ștergeți folderul vechi `primehr-desktop`, dezarhivați noul zip, apoi **fie** `build-win.bat` (pentru `.exe`), **fie** `npm install` + `npm run dev:host` (trial browser).

## Cum deschide Nicolae modulul IGM (web)

```bat
cd %USERPROFILE%\Desktop\primehr-desktop
npm install
npm run dev:host
```

Browser: **http://127.0.0.1:5173** → Host → login `igm1` / `Igm123!@#` (sau `admin`) → schimbă parola → **Documente & IGM**.

Detalii: `docs/igm-module-status.md` (în Agent Store).

## Următorii pași

- Port Manager workspace + wizard caz
- ACL / transfer responsabilitate
- CEO dashboard + închidere/redeschidere
- Import din spreadsheet-ul vechi
- `.exe` rebuild (pauză — preferință delivery web/dev)

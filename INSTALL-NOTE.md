# Notă instalare — Windows birou

**Nu este nevoie de Python sau Visual Studio Build Tools.** Stack-ul folosește `sql.js` (SQLite în WASM/JS).

## Pentru utilizatorii din birou (fără npm)

Instalați `PrimeHR-Documents-Setup-0.1.0.exe` (NSIS). La prima pornire pe PC-ul principal → **Host** (implicit). Datele: `%APPDATA%\PrimeHR Documents\primehr-data\`.

## Pentru Nicolae — o comandă pe Windows ca să obțineți `.exe`

1. Dezarhivați `primehr-desktop.zip` pe disc local (NTFS), ex. Desktop.
2. Dublu-click pe **`build-win.bat`** (sau în CMD):

```bat
cd %USERPROFILE%\Desktop\primehr-desktop
build-win.bat
```

3. Luați instalatorul din `release\PrimeHR-Documents-Setup-0.1.0.exe`.

Echivalent manual:

```bat
npm config set ignore-scripts false
npm install
npm run build:win
```

### Dacă Electron a eșuat la install (`allowScripts` / binary incompleț)

```bat
npm config set ignore-scripts false
npm rebuild electron
node scripts\ensure-electron.cjs --strict
npm run build:win
```

## Trial browser (fără Electron / fără `.exe`)

```bat
npm install
npm run smoke
npm run dev:host
```

Deschideți **http://127.0.0.1:5173** → Host → login `admin` / `Admin123!@#`.

## Pe Cloud Agent / FUSE

Folderul `node_modules/` din Project store poate fi incomplet pe mount FUSE. Lucrați pe copie locală `/agent/primehr-desktop`. Build NSIS Windows pe Linux necesită Wine — dacă lipsește, folosiți `build-win.bat` pe PC-ul Windows.

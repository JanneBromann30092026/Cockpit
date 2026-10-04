# Cockpit – Meine persönliche Schaltzentrale

## Vision
Cockpit ist eine Progressive Web App (PWA) nur für mich: Tagesüberblick, Aufgaben, meine eigenen Verträge, Tages- und Wochen-Reviews, eine Lebensbibliothek und mein Markenprofil – alles in einer App auf dem Homescreen. Primäres Zielgerät ist ein **iPad (Safari, als Homescreen-App installiert)**, bedient per Touch und optional mit Hardware-Tastatur. Alle persönlichen Daten liegen **ausschließlich verschlüsselt auf dem Gerät**; die App funktioniert offline, außer Google-Anbindung, optionaler KI und Push-Mitteilungen.

Vorlage ist der Guide „5 Dinge, die du an einem freien Wochenende mit Claude baust“ (gptmarlon.com). Dort laufen die Projekte über Claude + Notion; Cockpit baut sie als eigene App nach – ohne Notion, mit eigener Datenhaltung.

1. **Heute (Dashboard):** Termine von heute (Google Kalender, mit Uhrzeit und Ort), ungelesene Mails der letzten 24 Stunden (Gmail; Absender, Betreff, eine Zeile Zusammenfassung; Mails von echten Personen mit Frage oder Frist oben, Newsletter und Werbung unten), fällige und überfällige Aufgaben, demnächst fällige Verträge/Fristen, Tagesüberblick in drei Sätzen („Was ist heute das Wichtigste, wo wird es zeitlich eng?“). Button „Aktualisieren“.
2. **Aufgaben:** Titel, Status (offen/erledigt), fällig am, Priorität (hoch/mittel/niedrig).
3. **Verträge & Dokumente („Zweites Gehirn“):** nur **meine eigenen** Verträge (Mietvertrag, Versicherungen, Handy, Abos …): Name, Kategorie, Anbieter, fällig am (nächster Zahlungs- oder Verlängerungstermin), Kündigungsfrist, Betrag in Euro, Zusammenfassung in höchstens fünf Stichpunkten, Original-PDF oder Foto direkt am Eintrag. Fragen stellen („Wann ist meine Versicherung fällig? Wann kann ich spätestens kündigen?“). Fristen in den iPad-Kalender übernehmen.
4. **Reviews:** Tages-Review jeden Abend (Was gut lief, Was nicht gut lief, Besser machen – je zwei bis drei konkrete Punkte, dazu „Meine Notiz“) und Wochen-Review am Sonntag (Muster, größte Bremsen, genau drei konkrete Änderungen → landen als Aufgaben, fällig am kommenden Montag).
5. **Lebensbibliothek:** Bücher, Artikel, Newsletter, YouTube-Videos, Podcasts: Titel, Typ, Autor oder Quelle, Link, konsumiert am, Themen (mehrere), Kernaussagen, meine Gedanken. Später fragen: „Was habe ich zu Thema X gelernt?“ – Antwort mit Quelle. Vergangenes in einem Rutsch als Liste nachtragen.
6. **Markenprofil & Brand-Kit:** Interview (zehn Fragen, eine nach der anderen) → Markenprofil (Tonalität, Werte, Wörter, die ich nutze und nie nutze, drei Beispielsätze) → Design System (Farbpalette mit Hex-Codes, Schriften für Überschrift und Fließtext, Komponenten). „Damit bauen“: Texte für Newsletter, Landingpage, Instagram-Post oder Videoskript im Ton des Markenprofils.
7. **Push-Mitteilungen:** Erinnerungen auf dem Homescreen, z. B. morgens „Dein Tag“, 21:30 Uhr „Zeit für deinen Tages-Review“, sonntags 19:00 Uhr „Wochen-Review“.

## Arbeitsumgebung (wichtig)
- Der Nutzer hat **nur ein iPad**, keinen Rechner. Entwickelt wird ausschließlich in Claude-Code-Cloud-Sitzungen. Der Nutzer kann keine Befehle lokal ausführen und keinen Dev-Server öffnen.
- Der Nutzer sieht die App nur über das Deployment auf GitHub Pages: https://jannebromann30092026.github.io/Cockpit/ (Deploy automatisch per GitHub Actions bei jedem Push auf main).
- Deshalb gilt für jeden Schritt: Die App selbst mit Playwright (vorinstalliertes Chromium, kein "playwright install") gegen den Production-Build (vite preview) prüfen und **Screenshots im iPad-Format** (Querformat 1180×820 und Hochformat 820×1180, deviceScaleFactor 2, hasTouch, isMobile) erstellen und dem Nutzer zeigen.
- Entwicklerwerkzeuge (Komponentenübersicht, Demo-Daten) müssen auch im Production-Build erreichbar sein, versteckt hinter einem Schalter „Entwicklermodus“ in den Einstellungen.
- Arbeite auf einem Feature-Branch und erstelle am Ende einen Pull Request mit kurzer deutscher Beschreibung, was der Nutzer nach dem Mergen auf dem iPad prüfen soll.
- Das Repo ist **öffentlich** (GitHub Pages im kostenlosen Plan). Es enthält **nie** echte persönliche Daten, nur Code und erfundene Demo-Daten. Geheimnisse (VAPID-Privatschlüssel, Push-Abo) nur als GitHub-Actions-Secrets.
- Schwesterprojekte **Kompass** (`JanneBromann30092026/Kompass`) und **Synapse** (`JanneBromann30092026/Synapse-`), beide öffentlich: gleiche Arbeitsweise und Technik. Infrastruktur und Komponenten dürfen von dort kopiert und angepasst werden (Kompass ist die neueste Basis: Tresor, Sperre, Sync, Kalender-Export); die Apps bleiben aber vollständig getrennt (eigenes Repo, eigene Daten, keine gemeinsamen Pakete).
- **Gleicher Origin** wie Kompass und Synapse (jannebromann30092026.github.io): eigene Namen sind Pflicht – Dexie-DB `cockpit`, localStorage-Präfix `cockpit.`, Workbox-`cacheId` `cockpit`, Service-Worker-Scope `/Cockpit/`.

## Tech-Stack (verbindlich, nicht ohne Rückfrage ändern)
Gleiche Versionen wie Kompass (dort in package.json nachsehen):
- Node.js 22 LTS (.nvmrc und "engines")
- Vite + React 19 mit TypeScript im strict-Modus (kein any, keine ts-ignore ohne Begründungskommentar)
- vite-plugin-pwa (Workbox) für Manifest, Service Worker, Offline-Fähigkeit und Update-Hinweis; für Push ggf. `injectManifest` statt `generateSW` (Entscheidung in Schritt 8)
- Tailwind CSS 4 (@tailwindcss/vite), Design-Tokens als CSS-Variablen
- Motion (Paket "motion", Import aus "motion/react") für Animationen
- lucide-react für Icons, Inter als Schrift (@fontsource-variable/inter)
- Zustand für UI-State
- react-router (HashRouter, Import aus "react-router") für Navigation
- Dexie.js (IndexedDB) als lokale Datenbank, versioniertes Schema als Migrationen
- **Web Crypto API** (PBKDF2 + AES-GCM) für die Verschlüsselung – keine Krypto-Bibliotheken von Dritten in der App
- zod für Validierung
- @anthropic-ai/sdk direkt im Browser (dangerouslyAllowBrowser: true), **optional** und standardmäßig aus (Standardmodell: claude-haiku-4-5-20251001, konfigurierbar)
- Google Kalender und Gmail über die Google-REST-APIs direkt aus dem Browser (nur lesend), Anmeldung per OAuth (Ansatz in Schritt 4)
- Web Push (VAPID); Versand per Node-Skript in GitHub Actions (Bibliothek für den Versand im Skript erlaubt, nicht in der App)
- Vitest (+ fake-indexeddb) für Unit-Tests, @playwright/test exakt 1.56.1 für Smoke-Tests und Screenshots, ESLint + Prettier
- Deployment: GitHub Actions → GitHub Pages (Vite base: "/Cockpit/")

## Architekturprinzipien
- **Alle persönlichen Daten bleiben auf dem Gerät und sind verschlüsselt** – wie in Kompass: App-Passwort beim ersten Start, PBKDF2 (SHA-256, ≥ 600.000 Iterationen, zufälliges Salt) → AES-GCM-256-Schlüssel **nur im Arbeitsspeicher** (nicht extrahierbar). Gespeichert werden nur Salt, Iterationen und ein verschlüsselter Prüfwert.
- In Dexie nur verschlüsselte `payload` (Ciphertext + IV); unverschlüsselt ausschließlich technische Felder (UUID, Fremdschlüssel-UUID, updatedAt). Suchen, Filtern, Sortieren im Speicher nach dem Entschlüsseln. **PDFs und Fotos** werden ebenfalls verschlüsselt gespeichert (eigene Tabelle für Dateien, Inhalt erst beim Öffnen entschlüsseln).
- **App-Sperre** wie Kompass: beim Start, nach einstellbarer Inaktivität (Standard 5 Minuten) und nach längerer Zeit im Hintergrund; Schlüssel und Entschlüsseltes werden aus dem Speicher entfernt. Passwort vergessen = Daten verloren (Hinweis im Onboarding, Passwort im iPad-Schlüsselbund speichern, regelmäßig Backup exportieren).
- Beim Start navigator.storage.persist() anfordern. Regelmäßige Export-Erinnerung (verschlüsselte Backup-Datei).
- Datenzugriff nur über Repository-Module (src/data/repositories/*); Komponenten greifen nie direkt auf Dexie oder die Krypto-Schicht zu. Schemaänderungen nur über neue Dexie-Versionen mit upgrade-Funktion.
- API-Key (Anthropic) verschlüsselt in Tabelle "secrets", nie geloggt, nie exportiert, in der UI nie wieder im Klartext („Key hinterlegt“). Google-Zugriffstoken nur im Arbeitsspeicher; die OAuth-Client-ID ist öffentlich und darf im Code stehen, ein Client-Secret nie.
- **KI ist optional und standardmäßig aus.** Alle Funktionen arbeiten ohne KI (Regeln, Formulare, Textvorlagen). Mit KI wird nur gesendet, was die jeweilige Funktion braucht, und nur auf ausdrücklichen Tipp; vor dem Senden eines Vertrags-PDFs Hinweis „Kontonummern, Ausweis- und Versicherungsnummern vorher schwärzen“. KI erfindet nichts: unsichere Felder bleiben leer und werden als „offener Punkt“ geführt; von der KI formulierte Kernaussagen werden mit „(Claude)“ markiert. KI-Aufrufe gekapselt über src/services/ai/*.
- Google-Daten (Termine, Mails) werden nur gelesen, nur im Speicher gehalten und nicht dauerhaft gespeichert (höchstens eine verschlüsselte Zwischenablage für offline, Entscheidung in Schritt 4).
- **Push:** Web Push funktioniert auf dem iPad nur für die Homescreen-App (iPadOS 16.4+) und nach Erlaubnis per Tipp. Der Server kennt keine persönlichen Daten: Mitteilungen sind allgemein („Zeit für deinen Tages-Review“), ein Tipp öffnet die passende Seite. VAPID-Privatschlüssel und Push-Abo liegen nur als GitHub-Secrets (die App zeigt das Abo zum Kopieren). GitHub-Zeitpläne laufen in UTC und oft verspätet (Minuten bis ca. 30 Min.), selten fallen sie aus; Sommer-/Winterzeit im Skript über Europe/Berlin prüfen. Zeitpläne in öffentlichen Repos werden nach 60 Tagen ohne Aktivität deaktiviert → Lösung in Schritt 8. Fristen und Fälligkeiten zusätzlich über Kalender-Export (zuverlässiger als Push).
- Reine Logik (Fälligkeiten, Kündigungsfristen, Mail-Einordnung, Tagesüberblick ohne KI, Review-Auswertung, Bibliothek-Suche, Krypto-Formate) liegt in framework-unabhängigen Modulen unter src/core/ und ist mit Vitest getestet.
- Content-Security-Policy per meta-Tag, so restriktiv wie möglich; externe Verbindungen nur zu Google (OAuth, Kalender, Gmail) und api.anthropic.com (optionale KI), jeweils erst mit dem Schritt, der sie braucht.

## Fachliche Regeln
- Nur Fakten speichern, die ich nenne oder die im Dokument stehen; Unbekanntes bleibt leer und wird als „offener Punkt“ geführt.
- Keine Kontonummern/IBAN, Ausweis- oder Steuer-ID als eigene Felder.
- Kündigungsfrist: Text aus dem Vertrag plus, wenn berechenbar, „spätestens kündigen bis“. Fristen und Beträge immer mit Hinweis „im Original-PDF prüfen“; steuerliche/rechtliche Hinweise immer als „prüfen“, nie als Beratung.
- Mail-Einordnung ohne KI über Header und Gmail-Kategorien (z. B. List-Unsubscribe, Werbung/Updates); mit KI optional verfeinert.
- Reviews beziehen sich nur auf echte Daten (Kalender, Aufgaben, meine Notiz); offene Aufgaben werden nicht verschoben, sondern unter „Besser machen“ gelistet.

## Ordnerstruktur (Zielbild)
src/core/            – reine Logik ohne React/Browser-APIs (tasks, documents, reviews, library, brand, today, mail, crypto-Formate)
src/data/            – Dexie-Datenbank, Schema/Migrationen, Repositories, Typen, Stammdaten (Kategorien, Typen, Interviewfragen, Vorlagen)
src/services/        – Krypto/Tresor, Google, KI-Provider, Push, Backup/Export
src/app/             – App-Root, Router, Shell, Sperrbildschirm
src/components/ui/   – Design-System-Komponenten
src/features/        – today, tasks, documents, reviews, library, brand, settings, transfer, dev
src/styles/          – Tokens, globale Styles, motion.ts
src/i18n/de.ts       – alle UI-Texte zentral (Deutsch)
scripts/             – Icons, Push-Versand (GitHub Actions)
e2e/                 – Playwright-Tests und Screenshot-Skript

## Design-Leitlinien
Gleiche Designsprache wie Kompass und Synapse – schlicht, modern, ruhig, große Radien, Pill-Buttons, viel Weißraum, Inter, weiche Schatten, feine Ränder, kurze federnde Spring-Animationen, gezielte Effekte an Schlüsselmomenten (Entsperren, Aufgabe erledigt, Review abgeschlossen). Dark und Light Mode, Standard folgt dem System. prefers-reduced-motion wird respektiert.

**Eigene Identität (klar unterscheidbar von Kompass und Synapse):**
- Akzentfarbe **Kobaltblau** statt Petrol (Kompass) und Violett (Synapse); ergänzender Akzent **Signalgelb** für Hervorhebungen (angelehnt an die gelben Markierungen im Guide). Status-Farben Grün/Rot-Orange klar getrennt. Alle Textfarben ≥ 4,5:1; genaue Werte in Schritt 1.
- App-Icon: abgerundetes Quadrat mit dunklem Blau-Verlauf und geometrischem **Rundinstrument** (Skala mit Nadel, Nadel in Signalgelb). Startbildschirm im selben Stil.
- Name überall „Cockpit“ (Manifest name und short_name).

Touch-first (iPad), wie Kompass:
- Tippflächen mindestens 44×44 px. Nichts nur per Hover; Hover-Effekte nur unter @media (hover: hover).
- Safe Areas, Höhen mit dvh, kein ungewolltes Scrollen/Bounce.
- Bildschirmtastatur: aktives Feld bleibt sichtbar (visualViewport).
- Gesten immer mit sichtbarer Button-Alternative. Tastaturkürzel für Hardware-Tastaturen.
- Hoch- und Querformat, Split View (ab ca. 500 px Breite).

## Konventionen
- UI-Sprache Deutsch (du-Form, freundlich, knapp), Code/Variablen/Kommentare Englisch.
- Keine hartkodierten UI-Texte in Komponenten – alles aus src/i18n/de.ts. Fachliche Vorlagen (Interviewfragen, Prompt-Vorlagen, Kategorien) liegen als Daten in src/data.
- IDs sind UUIDs (crypto.randomUUID), Zeitstempel als ISO-Strings in UTC; Kalenderdaten als „JJJJ-MM-TT“ in lokaler Zeit.
- Jeder Schritt endet mit: npm run typecheck, npm run lint, npm run test und npm run build ohne Fehler, plus Playwright-Screenshots.
- Google und KI in Tests immer per `page.route` mocken (inkl. OPTIONS-Preflight); nie echte Konten oder Keys in Tests.
- Implementiere immer nur den aktuell beauftragten Schritt. Baue keine Features künftiger Schritte vor, verbaue sie aber auch nicht.
- Nach Abschluss eines Schritts: Roadmap unten abhaken und unter „Entscheidungen & Notizen“ wichtige Abweichungen oder Erkenntnisse kurz dokumentieren.

## Roadmap
- [x] 0 Projektkontext (CLAUDE.md)
- [x] 1 Fundament: Setup, PWA, Deployment, Design-System & Shell (aus Kompass)
- [x] 2 Datenbank, Verschlüsselung & App-Sperre (aus Kompass)
- [x] 3 Einstellungen & optionale KI (Grundlage: Key, Modell, Test)
- [x] 4 Google-Anbindung & „Heute“ (Kalender, Gmail; Anmeldung auf dem iPad zuerst prüfen)
- [x] 5 Aufgaben (inkl. Anzeige in „Heute“)
- [ ] 6 Verträge & Dokumente (PDF/Foto, Fristen, Kalender-Export, Fragen, KI-Auslesen)
- [ ] 7 Reviews (Tag & Woche, Änderungen als Aufgaben, KI-Auswertung)
- [ ] 8 Push-Mitteilungen (GitHub Actions)
- [ ] 9 Lebensbibliothek (Einträge, Nachtragen, Suche, Fragen mit Quelle)
- [ ] 10 Markenprofil & Brand-Kit (Interview, Design System, „Damit bauen“)
- [ ] 11 Backups, Export & Import
- [ ] 12 Feinschliff & Installation

## Entscheidungen & Notizen
- Entstehung: Guide „5 Dinge, die du an einem freien Wochenende mit Claude baust“ (gptmarlon.com). Statt Claude + Notion eine eigene PWA, weil alles in einer App auf dem Homescreen liegen soll, mit Push-Mitteilungen. Notion entfällt (Notion-API erlaubt keinen direkten Zugriff aus dem Browser). Geplante Aufgaben aus dem Guide (Morgen-Briefing, Tages-/Wochen-Review) werden zu Push-Erinnerungen + Auswertung beim Öffnen, weil Web-Apps auf dem iPad nicht im Hintergrund laufen.
- Entscheidungen vor dem Start: Name „Cockpit“; KI optional (eigener API-Key, separat abgerechnet); Google Kalender und Gmail von Anfang an (Schritt 4); Push per GitHub Actions (kostenlos, Zeiten ungenau).
- Getrennt von Kompass: keine gemeinsamen Daten oder Pakete; Kompass dient nur als Vorlage für Code.
- Schritt 1 (Fundament):
  - Basis ist der Stand von Kompass-Schritt 1 (gleiche Paketversionen, Lockfile übernommen), ergänzt um spätere allgemeine Verbesserungen aus Kompass: `ChoiceChip`, `SearchInput`, `SidePanel`, Toasts mit Aktion („Rückgängig“), BottomSheet hält das Feld über der Tastatur, `--on-signal`, Breakpoint `wide` in rem (56.25rem, sonst überschreibt `sm:` jede `wide:`-Klasse). Weggelassen: Kompass-Fachteile, Sperre/Tresor (Schritt 2), `PasswordInput` (Schritt 2), `noStyleInjectPlugin` (nur für force-graph in Kompass nötig).
  - Eigene Namen (gleicher Origin wie Kompass/Synapse): Dexie-DB `cockpit` (Version 1 nur `settings`: Theme, Bewegung, Seitenleiste, Entwicklermodus – bewusst unverschlüsselt, keine persönlichen Daten, vor dem Entsperren nötig; Schritt 2 ergänzt verschlüsselte Tabellen als **Version 2**), localStorage `cockpit.bootPrefs`, Workbox `cacheId: 'cockpit'`, Service-Worker-Scope `/Cockpit/` (E2E prüft alles).
  - CSP: `connect-src 'self'`; Google (Schritt 4) und api.anthropic.com (Schritt 3) kommen erst mit ihrem Schritt dazu.
  - Farben (alle Textfarben ≥ 4,5:1 auf --bg/--surface): Akzent Kobaltblau hell `#1d4ed8` (weiße Schrift), dunkel `#6b93ff` mit dunkler Schrift (`--on-accent` `#050b1f`). Signalgelb: `--signal` (`#f5c400`/`#ffd23f`) für Flächen/Punkte, `--signal-fg` (`#7a5800`/`#ffd23f`) für Text, `--on-signal` für Schrift auf Gelb; Badge-Ton `signal`. Erfolg Grün (`#15803d`/`#4ade80`), Warnung Rot-Orange (`#c2410c`/`#fb923c`), Fehler Rose. Hintergrund `#f3f5f9`/`#090d16` (= theme-color, Startbilder). Icon-Töne `--cobalt-deep/-cobalt/-cobalt-light`.
  - Icon: Quelle `public/icons/favicon.svg` (Rundinstrument: Skala über 240°, beleuchteter Teil bis zur Nadel, Nadel Signalgelb, dunkler Blau-Verlauf). `npm run icons` erzeugt pwa-192/512, maskable und apple-touch-icon (randlos) sowie iOS-Startbilder hell/dunkel. Leere Zustände zeigen dasselbe Motiv klein.
  - Navigation: Heute, Aufgaben, Verträge, Reviews, Bibliothek, Marke, Einstellungen (+ Entwickler im Entwicklermodus); Routen /today, /tasks, /documents, /reviews, /library, /brand, /settings, /dev/ui. Platzhalter in src/features/coming-soon („Kommt in Schritt …“). Hardware-Tastatur: `1`–`7` öffnen die Bereiche (nicht in Textfeldern/Dialogen), `?` zeigt alle Kürzel.
  - Fokusmodus wie Kompass (`useFocusModeRequest`, Test in /dev/ui). Split View (500 px): Tab-Beschriftungen kürzen sich mit „…“.
  - `npm run screenshots` erzeugt alle Seiten in Quer/Hoch × Hell/Dunkel, Split View dunkel und `icon-preview.png`.
- Schritt 2 (Datenbank, Verschlüsselung & App-Sperre):
  - Aus Kompass (Stand Schritt 7) übernommen: Krypto-Formate (src/core/crypto), Web-Crypto-Schicht, Sitzungsschlüssel nur in src/services/crypto/session.ts, Tresor (src/services/vault.ts), Passwortwechsel mit Neuverschlüsselung in einer Transaktion (reencrypt.ts, prüft per IV, dass niemand dazwischen schrieb; bis zu 3 Versuche), Abgleich zwischen Tabs (src/data/sync.ts: liveQuery liest nur id + updatedAt, entschlüsselt wird außerhalb), Sperrbildschirm, Auto-Sperre, Fehlversuche mit Wartezeit (in meta, übersteht Neuladen), „Passwort vergessen?“ (LÖSCHEN eingeben), Schlüsselbund/Face ID über echtes `<form>` mit verstecktem Benutzerfeld „Cockpit“.
  - Krypto: PBKDF2-SHA-256 mit **800.000 Iterationen** (Mindestwert 600.000 wird beim Lesen geprüft), AES-GCM-256, je Schreibvorgang neuer 12-Byte-IV, Format `{v: 1, iv, ct}`, AAD `cockpit:v1:<tabelle>:<id>`, Passwort NFC-normalisiert. Gemessen im Cloud-Chromium (Xeon 2,8 GHz, schwankend): 600k ≈ 360 ms, 800k ≈ 390 ms, 1 Mio. ≈ 430 ms. Die tatsächliche Dauer auf dem iPad zeigt Einstellungen → Sicherheit im Entwicklermodus.
  - Dexie **Version 2**: `meta` (Tresor, Schema-Info, Fehlversuche), verschlüsselte Datentabellen `tasks`, `documents`, `reviews`, `library`, `brand` (lesbar nur id + updatedAt) und `secrets` (Schlüssel `key`, für den API-Key in Schritt 3). Bewusst noch nicht: Dateien (eigene Tabelle mit Schritt 6, Inhalt nie im Speicher-Store), Entwürfe, Backups.
  - Datenmodell in src/data/schemas.ts nach den Feldern der Vision (Aufgabe, Vertrag, Review, Bibliothekseintrag, Markenprofil) mit `demo`-Kennzeichen; die Feature-Schritte verfeinern es. Neue optionale Felder brauchen keine Migration (verschlüsselte JSON-Payload). Aufzählungen (Status, Priorität, Kategorien, Review-Art, Bibliothekstyp) als englische Schlüssel in src/data/domain.ts.
  - Repositories: generisches `createRecordRepo` (list/get/create/update/remove, zod-Validierung, strikt steigendes updatedAt) für alle Datentabellen; Fachlogik kommt in den Schritten dazu. Komponenten lesen über `useDataStore`, schreiben nur über Repositories.
  - Sperrbildschirm mit lebendem Rundinstrument (`GaugeMark`): Nadel misst während der Prüfung, schwingt beim Entsperren in die Icon-Stellung und die Skala leuchtet auf. Seitenleiste hat „Sperren“, Einstellungen → Sicherheit „Jetzt sperren“, Sperrzeit (1–30 Min., Standard 5), Passwort ändern. Hintergrund > 1 Min. sperrt immer.
  - Testpasswort `Cockpit-Test-2026!` (src/core/devConstants.ts = e2e/ipad.ts), im Entwicklermodus sichtbar. Entwicklerbereich „Verschlüsselung testen“: Testaufgaben anlegen/ändern/löschen, Zähler je Tabelle, Ciphertext-Vorschau; „Datenbank zurücksetzen“ in den Einstellungen.
  - Tests: Krypto (Round-Trip, falsches Passwort, manipulierter Ciphertext/IV, AAD, Formatversion), Tresor, Passwortwechsel inkl. secrets, Sync, Repositories, Schema-Upgrade von Version 1. E2E: Ersteinrichtung, Sperren/Entsperren, Wartezeit, Inaktivität und Hintergrund (Zeitverschiebung nur für `Date.now()`), kein Klartext in IndexedDB/localStorage, zweiter Tab, Passwortwechsel, Passwort vergessen, Offline-Entsperren.
- Schritt 3 (Einstellungen & optionale KI):
  - Aufbau wie Synapse (src/services/ai: config, types, apiKey, anthropicProvider, index). `@anthropic-ai/sdk` ^0.131.0, direkt im Browser (`dangerouslyAllowBrowser`, `maxRetries: 1`, 15 s Zeitlimit); das SDK liegt in einem eigenen Lazy-Chunk und wird erst beim ersten KI-Aufruf geladen. CSP: `connect-src 'self' https://api.anthropic.com`.
  - Einstellungen: `aiEnabled` (Standard aus) und `aiModel` (Standard `claude-haiku-4-5-20251001`; Auswahl Haiku 4.5 / Sonnet 5.5 / Opus 5.5 oder eigene Modell-ID, Muster `AI_MODEL_PATTERN`). Ausgeschaltet bleibt ein hinterlegter Key gespeichert, die App sendet nichts.
  - API-Key: verschlüsselt in `secrets` (`secretsRepo`, AAD `cockpit:v1:secrets:<key>`, Passwortwechsel verschlüsselt mit), nie im Store, nie im Klartext angezeigt („Key hinterlegt“), Status über `observeHas` (liveQuery liest nur, ob der Eintrag existiert). Eingabefeld ist bewusst `type="text"` mit `-webkit-text-security: disc` statt Passwortfeld, damit Safari nicht den Schlüsselbund (mit dem App-Passwort) anbietet.
  - „Verbindung testen“ ruft `models.retrieve` auf (prüft Key, Netz und Modell, erzeugt keine Tokens, kostet nichts). Fehlercodes: NO_API_KEY, DISABLED, LOCKED, OFFLINE (vor dem Laden des SDK geprüft), NETWORK, TIMEOUT, ABORTED, RATE_LIMIT (429), OVERLOADED (529), AUTH (401/403), MODEL_NOT_FOUND (404), API_ERROR – deutsche Texte in de.ts, nie mit Key.
  - Für spätere KI-Funktionen: Sonnet 5.5 / Opus 5.5 lehnen erzwungenes `tool_choice` (`any`/`tool`) ab → `auto` + `strict: true` oder Structured Outputs; vor dem Lesen von `content` immer `stop_reason` (auch `refusal`) prüfen; Opus 5.5 denkt immer (kein `thinking: disabled`), Tiefe über `output_config.effort`.
  - Tests: Provider/Fehlerzuordnung (Fake-Client), Key-Speicherung verschlüsselt, gesperrt → LOCKED, offline → OFFLINE. E2E mit `page.route` auf api.anthropic.com (inkl. OPTIONS-Preflight): standardmäßig keine Anfrage, Key speichern/entfernen, kein Key im DOM/IndexedDB/localStorage, Header `x-api-key` und `anthropic-dangerous-direct-browser-access`, 401/404/429/529, offline, Modellwahl übersteht Neuladen. Achtung: Das SDK wiederholt 429/529 einmal selbst – Mocks müssen bei mehreren Anfragen gleich antworten.
- Schritt 4, Teil 1 (Google-Anmeldung auf dem iPad prüfen):
  - Recherche: In installierten Homescreen-Apps übergibt iOS eine ganzseitige Weiterleitung zu einer fremden Domain an Safari (eigener Speicher → Token und Tresor getrennt); `window.open` bleibt laut Apple (WWDC23) in der Homescreen-App. Deshalb zwei Varianten zum Testen auf dem iPad: Fenster (`connectWithPopup`, Ergebnis per `postMessage` an den Opener oder `BroadcastChannel`) und Weiterleitung (`connectWithRedirect`, Ergebnis über sessionStorage desselben Tabs, App startet gesperrt neu). Nach dem iPad-Test bleibt nur die funktionierende Variante.
  - OAuth 2.0 Token-Flow (`response_type=token`) ohne Google-Bibliothek: kein fremdes Skript, CSP nur `connect-src` für www.googleapis.com, gmail.googleapis.com, oauth2.googleapis.com (Widerruf). Scopes nur `calendar.readonly` und `gmail.readonly`; fehlt eine Berechtigung (Google erlaubt Abwählen) → MISSING_SCOPES. `state` gegen CSRF geprüft. Kein Refresh-Token für Browser-Apps: Token ≈ 1 h, eine Minute vor Ablauf gilt es als abgelaufen.
  - Callback-Seite `oauth.html` als zweiter Vite-Eintrag (src/oauth/callback.ts, mit CSP, ohne Startbilder, vom Service Worker vorab gespeichert); entfernt das Token sofort aus der Adresszeile.
  - Token nur im Arbeitsspeicher (src/services/google/session.ts), nie in IndexedDB/localStorage; bleibt beim Sperren der App bis zum Ablauf erhalten (gibt allein keinen Zugriff auf Cockpit-Daten). „Trennen“ widerruft es bei Google.
  - Einstellungen → Google: Client-ID (öffentlich, als Einstellung gespeichert, Muster `…apps.googleusercontent.com`), Einrichtungsanleitung mit Ursprung und Weiterleitungs-URI zum Kopieren, Verbinden (beide Varianten), „Zugriff testen“ (Kalenderliste + Gmail-Profil), Fehlertexte je Dienst (u. a. API nicht aktiviert, abgelaufen, verweigert).
  - Tests: core/google/oauth (URL, Fragment, Scopes, Client-ID), Session-Ablauf; E2E mit gemocktem accounts.google.com (302 auf oauth.html) und gemockten APIs inkl. Preflight: Fenster, Weiterleitung mit Entsperren, Ablehnung, fehlende Berechtigung, Abbruch, 403 API aus, 401 abgelaufen, Token nie im Speicher.
- Schritt 4, Teil 2 („Heute“):
  - Daten: Termine aller in Google Kalender angezeigten Kalender (`primary` oder `selected`), nur heute (lokaler Tag, `singleEvents`), ohne abgesagte und von mir abgelehnte Termine, doppelte (gleicher Titel + Zeit) einmal. Mails: `in:inbox is:unread newer_than:1d`, höchstens 30, nur Metadaten (From, Subject, List-Unsubscribe, Precedence) + Vorschauzeile, 6 Anfragen parallel.
  - **Keine Offline-Zwischenablage**: Termine und Mails liegen nur im Arbeitsspeicher (`src/features/today/todayStore.ts`) und werden beim Sperren gelöscht; nach dem Entsperren lädt „Heute“ neu (Token bleibt bis zum Ablauf). „Trennen“ löscht sie, ein abgelaufenes Token lässt das Angezeigte stehen (Hinweis „Neu verbinden“). Neu geladen wird beim Öffnen, wenn nichts da ist, eine Quelle fehlte oder die Daten älter als 5 Min. sind; dazu „Aktualisieren“ und Taste `R`.
  - Mail-Einordnung ohne KI (src/core/mail/classify.ts): Gmail-Kategorien (Werbung, Soziale Netzwerke, Foren, Updates), List-Unsubscribe/Precedence → Newsletter, typische Absender (noreply, info …) → Update, sonst Person. Person + „?“ oder Frist-Wörter/Datum → oben („Frage oder Frist“); Newsletter & Werbung eingeklappt.
  - Tagesüberblick ohne KI (src/core/today/overview.ts → features/today/overviewText.ts): 1. Wichtigstes (Mail mit Frist/Frage, sonst laufender/nächster Termin), 2. Zeitplan mit engster Stelle (< 15 Min. Puffer oder Überschneidung, nur noch bevorstehende), 3. Postfach. Fehlt eine Quelle: „konnte gerade nicht geladen werden“.
  - Optional „Mit Claude formulieren“ (nur bei eingeschalteter KI, nur auf Tipp): sendet Termine (Zeit, Titel, Ort), bei Mails von Personen Name, Betreff, Vorschauzeile, bei Updates nur Name + Betreff, Newsletter nur als Anzahl – nie Adressen. Prompt in src/data/prompts/daySummary.ts, höchstens drei Sätze, markiert „(Claude)“, zurück per „Ohne KI anzeigen“.
  - Fehler je Quelle (z. B. Gmail-API nicht aktiviert) – die andere Quelle bleibt sichtbar. Fällige Aufgaben und Fristen erscheinen als Platzhalter („Kommt in Schritt 5/6“).
  - Entwicklermodus: „Demo-Tag anzeigen“ (in „Heute“ und unter Entwickler) mit erfundenem Tag aus src/data/demo/today.ts; Links zu Google sind im Demo-Tag aus.
  - Tests: Unit (Termine, Mail-Einordnung, Überblick, Sätze, Prompt, Store inkl. Sperren/Trennen/Ablauf); E2E mit fester Uhrzeit (`page.clock.setFixedTime`) und gemockten Google-/Anthropic-APIs: Sortierung, Gruppen, Abfrage-Parameter, nichts in IndexedDB/localStorage, Sperren, Fehler je Quelle, Ablauf + Neu verbinden, KI nur auf Tipp ohne Adressen. Screenshots „Heute“ mit Demo-Tag in eigenem Kontext mit fester Uhrzeit (Mo 10:20).
- Schritt 4, Abschluss (iPad-Test):
  - Auf dem iPad (Homescreen-App) funktioniert die Anmeldung **per Fenster** (`window.open` öffnet Google als Blatt in der App, Ergebnis per `postMessage`/`BroadcastChannel`). Die Variante per Weiterleitung ist entfernt (Code, Texte, Test).
  - Häufigster Einrichtungsfehler: `redirect_uri_mismatch` – die Weiterleitungs-URI muss exakt `https://jannebromann30092026.github.io/Cockpit/oauth.html` sein (großes C), Ursprung `https://jannebromann30092026.github.io`.
  - Client-ID des Cockpit-Projekts fest eingebaut (`GOOGLE_CLIENT_ID` in src/services/google/config.ts, öffentlich). Einstellungen → Google zeigt ohne Entwicklermodus nur Verbinden/Testen/Trennen; Einrichtungsanleitung und eigene Client-ID (leer = eingebaute) nur im Entwicklermodus. „Heute“ verbindet direkt.
  - E2E: nicht auf das Schließen des Anmeldefensters warten (die App schließt es selbst, evtl. bevor der Listener hängt) – stattdessen auf den App-Zustand („Verbunden bis“).
- Schritt 5 (Aufgaben):
  - Logik in src/core/tasks/tasks.ts (Gruppen Überfällig/Heute/Morgen/Nächste 7 Tage/Später/Ohne Datum, fällig = offen und Datum ≤ heute, Sortierung, Verschieben) und src/core/dates.ts (Kalenderdaten wie Kompass, plus `weekday`/`nextMonday` für Schritt 7). Aktionen in src/data/repositories/taskActions.ts: erledigen (`completedAt`), wieder öffnen, verschieben, bearbeiten, löschen mit „Rückgängig“ (gleiche ID, `restore`). Die generischen Repos liegen jetzt in repositories/records.ts (vermeidet einen Import-Kreis).
  - Seite /tasks nach Kompass-Wiedervorlagen: Schnelleingabe (Enter; Chips Heute/Morgen/Wichtig gelten nur für die nächste Aufgabe), Gruppen, Abhaken per Kreis-Button oder Wischen nach rechts mit kurzem Erfolgsleuchten, „⋯“-Menü (Auf morgen, Eine Woche später, Datum wählen, Bearbeiten, Löschen), Editor als Seitenpanel/Bottom Sheet (`EditPanel` in app/shell), Erledigte eingeklappt (letzte 50). Taste `N` springt in die Schnelleingabe. Navigation zeigt die Zahl fälliger Aufgaben (gelbes Abzeichen, für Screenreader „3 fällig“).
  - „Heute“: Karte „Fällige Aufgaben“ (abhaken, neue Aufgabe für heute, „Alle Aufgaben“; leer: nächste anstehende Aufgabe). Tagesüberblick bezieht Aufgaben ein: Wichtigstes = überfällige hohe Aufgabe > Mail mit Frage/Frist > heute fällige hohe Aufgabe > laufender/nächster Termin > andere fällige Aufgabe; dritter Satz „Postfach und Aufgaben“. Der Überblick erscheint auch ohne Google, sobald Aufgaben fällig sind („Termine siehst du, sobald Google verbunden ist“ statt Fehlertext). Claude bekommt fällige Aufgaben nur mit Titel, Priorität und Tagen überfällig (keine Notizen).
  - Entwicklermodus „Demo-Daten“: 9 erfundene Aufgaben relativ zu heute (src/data/demo/tasks.ts, verschlüsselt, `demo: true`), „Demo-Daten löschen“ entfernt nur Demo-Einträge (auch die Testaufgaben aus „Verschlüsselung testen“).
  - Tests: Unit (Daten, Gruppen, Reihenfolge, Verschieben, Aktionen inkl. Rückgängig und Demo, Überblick mit Aufgaben, KI-Anfrage); E2E mit fester Uhrzeit: Schnelleingabe, Gruppen, Abzeichen, „Heute“, verschlüsselt gespeichert, Erledigen + Rückgängig, Wischen, Editor/Verschieben/Löschen + Rückgängig, Taste N, Demo-Daten. Achtung: Nach der Schnelleingabe hat das Feld den Fokus – Ziffern-Kürzel greifen dort bewusst nicht.
- Schritt 6, Teil 1 (Verträge, Originale, Fristen, Kalender):
  - Datenmodell erweitert (verschlüsselte JSON-Payload, keine Migration nötig): Zahlweise (`interval`), Laufzeitende (`termEnd`), Kündigungsfrist als Text (`noticePeriod`) plus berechenbar (`notice` = Anzahl + Tage/Wochen/Monate, beim Tippen aus dem Text erkannt, z. B. „3 Monate“, „einen Monat“), Notiz, Originale (`files`). Logik in src/core/documents/contracts.ts: „spätestens kündigen bis“ = Laufzeitende − Frist (nur wenn beides bekannt), nächste Zahlung rollt mit der Zahlweise weiter, Kosten pro Monat/Jahr, Fristenliste (Heute: Kündigen/Laufzeitende 30 Tage, Zahlungen 7 Tage voraus), Hinweise „Frist verpasst“/„Laufzeitende vorbei“. Überall „im Original prüfen – keine Rechtsberatung“.
  - **Originale (PDF/Foto)**: Dexie **Version 3** mit Tabelle `files` (lesbar nur id, documentId, updatedAt). Umschlag-Verschlüsselung: jede Datei hat einen eigenen zufälligen AES-256-Schlüssel, der im (verschlüsselten) Vertrag liegt; Inhalt AES-GCM mit AAD `cockpit:v1:files:<id>`. Vorteil: Passwortwechsel verschlüsselt nur die Verträge neu, nie die großen Dateien (Test vorhanden). Vertrag + Datei immer in einer Transaktion; Vertrag löschen löscht seine Originale. Höchstens 25 MB, nur PDF/JPEG/PNG/WebP/GIF/HEIC, 20 je Vertrag. Entschlüsselt wird erst beim Öffnen (Betrachter mit temporärer blob:-URL; CSP `frame-src 'self' blob:`), Fotos als Vorschaukachel. „Teilen / Sichern“ über die Teilen-Funktion des iPad (Fallback Download, aus Synapse).
  - PDF-Anzeige im Rahmen: Das Test-Chromium hat keinen PDF-Anzeiger (bleibt weiß); auf dem iPad prüfen, sonst über „Teilen / Sichern“ öffnen.
  - Kalender-Export (aus Kompass, src/core/calendar/ics.ts): nur Kündigungstermine und Laufzeitenden, ganztägig, Erinnerung 9 Uhr eine Woche und einen Tag vorher; Titel nur „Kündigen bis: Name“ – keine Beträge, keine Nummern.
  - Seiten /documents (Kosten, „Demnächst“, Suche, Kategorien, Karten) und /documents/:id (Termine & Fristen mit hervorgehobenem „Spätestens kündigen bis“, Überblick, Zusammenfassung ≤ 5, offene Punkte, Notiz, Originale). Taste `N` = neuer Vertrag.
  - „Heute“: Karte „Fristen & Verträge“; Tagesüberblick setzt eine Kündigungsfrist innerhalb von 7 Tagen nach einer überfälligen wichtigen Aufgabe an die erste Stelle („Frist: … im Original prüfen“). Claude bekommt anstehende Vertragsfristen nur mit Name, Art und Datum (keine Beträge).
  - Demo: 6 erfundene Verträge relativ zu heute (src/data/demo/documents.ts), einer mit erzeugter Demo-PDF (src/data/demo/pdf.ts, gültig, Umlaute per WinAnsi).
  - Fragen stellen und KI-Auslesen folgen in Teil 2 (Roadmap-Schritt 6 bleibt bis dahin offen).

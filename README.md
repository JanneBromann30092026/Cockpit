# Cockpit

Persönliche Schaltzentrale als Progressive Web App fürs iPad: Tagesüberblick (Google Kalender, Gmail), Aufgaben, eigene Verträge mit Fristen, Tages- und Wochen-Reviews, Lebensbibliothek und Markenprofil – mit Push-Mitteilungen.

Alle persönlichen Daten liegen ausschließlich verschlüsselt auf dem Gerät. Dieses Repo enthält nur Code und erfundene Demo-Daten.

App: https://jannebromann30092026.github.io/Cockpit/

## Installieren (iPad)

1. Die URL in Safari öffnen.
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Ab dann immer über das Homescreen-Icon öffnen – nur so bleiben die Daten zuverlässig erhalten.

## Entwicklung

Node.js 22 (`.nvmrc`). Wichtige Befehle:

- `npm run dev` – Entwicklungsserver
- `npm run typecheck`, `npm run lint`, `npm run test` – Prüfungen
- `npm run build` und `npm run preview` – Production-Build unter `/Cockpit/`
- `npm run e2e` – Playwright-Smoke-Tests (iPad quer/hoch)
- `npm run screenshots` – iPad-Screenshots nach `screenshots/`
- `npm run icons` – App-Icons und Startbilder aus `public/icons/favicon.svg`

Jeder Push auf `main` wird per GitHub Actions geprüft und auf GitHub Pages veröffentlicht.

Projektkontext und Roadmap: [CLAUDE.md](CLAUDE.md)

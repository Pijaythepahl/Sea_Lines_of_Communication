# Sea Lines of Communication

Lokales, rundenbasiertes Strategiespiel für zwei symmetrische Koalitionen. Eine Person steuert Blau und Rot abwechselnd über sechs Runden.

## Lokal starten

```powershell
pnpm install
pnpm dev
```

Die im Terminal angezeigte Adresse anschließend im Browser öffnen.

## Qualitätsprüfung

```powershell
pnpm test
pnpm build
```

Der statisch auslieferbare Produktionsstand wird unter `dist/` erzeugt.

## Aktueller Umfang

- neun maritime Regionen auf einer interaktiven Hybridkarte
- Präsenz, Lagebild, Zugang, Logistik und abgeleiteter Handelsertrag
- Haupt- und Ausweich-SLOCs mit exklusiv kontrollierbarem Engpass
- identische 20-Karten-Decks für Blau und Rot
- sechs Runden, Wirtschaftsauswertung, Sieger- und Gleichstandsregeln
- automatische lokale Speicherung im Browser
- globale Eskalationsleiter mit fünf strategischen Stufen
- gemeinsamer wirtschaftlicher Eskalationsmalus und zusätzliche Kosten für eigene riskante Aktionen
- Deeskalation über die Karte „Krisenkommunikation“

### Eskalation in MVP 2

- **0–1 Stabilität:** kein gemeinsamer Malus
- **2–3 Spannung:** −1 Routenertrag für beide Seiten
- **4–5 Krise:** −2 Routenertrag für beide Seiten
- **6–7 Konfrontation:** −3 Routenertrag für beide Seiten
- **8 Kontrollverlust:** −4 Routenertrag für beide Seiten

Riskante Karten erzeugen zusätzlich in der aktuellen Runde einen eigenen Verantwortungsmalus in Höhe ihres Eskalationswerts. Eine Runde ohne neue Eskalation senkt die Leiter automatisch um einen Punkt. Jedes Deck enthält zwei Karten „Krisenkommunikation“, die für einen Aktionspunkt die gemeinsame Eskalation um einen Punkt senken.

Nicht enthalten sind Backend, Online-Multiplayer, KI, Weltereignisse und asymmetrische Fraktionen.

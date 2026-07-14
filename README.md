# Sea Lines of Communication

Rundenbasiertes maritimes Strategiespiel für Desktop und Laptop. MVP 5 bietet eine vollständig deutsch- und englischsprachige Oberfläche, variable Einsatzdauer sowie Einzelspieler, lokales Pass-and-play und private Online-Partien.

## MVP 5

- Im Hauptmenü kann jederzeit zwischen Deutsch und Englisch gewechselt werden. Die Auswahl wird lokal gespeichert und gilt im Online-PvP nur für die eigene Ansicht.
- Neue Partien können über 6, 12 oder 18 Runden gespielt werden; 6 Runden bleiben Standard und Minimum.
- Im Online-PvP legt die raumeröffnende Person die Rundenzahl fest. Sie wird autoritativ mit dem Spielstand synchronisiert.
- 18-Runden-Partien verwenden drei statt zwei Exemplare jeder Karte, damit der Kartenvorrat bis zum Ende reicht.
- „Vorausstationierung“ erhöht neben der Präsenz auch das eigene Lagebild um 1, höchstens bis Lagebild 2. Das bloße Verlegen vorhandener Präsenz erzeugt kein Lagebild.
- Die wirtschaftlichen Schwellen der Führungswertung skalieren proportional zur Rundenzahl mit 2/3/4/5 Wirtschaftspunkten je Runde.

## Spielmodi

### Lokal gegen KI

- Der Mensch führt Blau, die KI führt Rot.
- Die KI bewertet Routenertrag, Projektion, Ausweichkapazität, verdeckte Optionen und Eskalationskosten.
- Der Spielstand wird automatisch im Browser gespeichert.

### Lokales PvP

- Blau und Rot spielen gemeinsam an einem Gerät.
- Ein Übergabebildschirm schützt Handkarten und vorbereitete Operationen.
- Der lokale PvP-Spielstand wird getrennt vom Einzelspieler gespeichert.

### Online-PvP

- Blau eröffnet einen privaten Raum und erhält einen sechsstelligen Einladungscode.
- Rot tritt über den Code oder einen Einladungslink bei.
- Ein Cloudflare Durable Object führt den autoritativen Spielstand und prüft jede Aktion.
- WebSockets synchronisieren Karte, Ausbau, Zugwechsel und Verbindungsstatus in Echtzeit.
- Gegnerische Hände, Decks, Abwurfdetails und geheime Aufträge werden nicht übertragen.

## Regeln von MVP 4 und MVP 5

- Ausweich-SLOCs starten bei Kapazität 3 und können für 2 AP einmal je Runde dauerhaft bis 5 ausgebaut werden.
- Eine friedliche Seite mit mindestens 1 Rest-AP erhält bei der Wertung +1 Ruhebonus.
- Eskalation 8 verursacht Kontrollverlust: −1 Ertrag, beziehungsweise −2 bei eigener Eskalationsverantwortung in der Runde.
- „Hybrider Druck“ und „Beschattungsoperation“ können für +1 AP verdeckt vorbereitet werden, wenn eigenes Lagebild mindestens 1 und gegnerisches Lagebild höchstens 1 beträgt.
- Verdeckte Aufträge wirken gleichzeitig vor der Wirtschaftsauswertung, steigern die Eskalation nicht, verhindern aber Ruhebonus und automatische Deeskalation.
- Nach der gewählten Anzahl von Wertungen bestimmt der Wirtschaftsertrag weiterhin den Sieger; beide Seiten erhalten zusätzlich eine Führungswertung von ein bis fünf Sternen.

## Lokal starten

Nur die Oberfläche mit lokalen Modi:

```powershell
pnpm install
pnpm dev
```

Vollständige App einschließlich lokaler Online-Spielräume:

```powershell
pnpm install
pnpm dev:multiplayer
```

## Qualitätsprüfung

```powershell
pnpm test
pnpm build
```

Für den automatischen Zwei-Spieler-Verbindungstest muss parallel `pnpm dev:multiplayer` laufen:

```powershell
pnpm test:multiplayer
```

## Cloudflare-Veröffentlichung

```powershell
pnpm deploy
```

Bei einer Veröffentlichung über die Cloudflare-GitHub-Integration bleiben die Einstellungen:

- Build-Befehl: `pnpm run build`
- Deploy-Befehl: `pnpm exec wrangler deploy`
- Produktionsdateien: `dist/`

Nicht enthalten sind Benutzerkonten, öffentliches Matchmaking, Ranglisten, Chat, Fraktionsasymmetrie, Audio und vollwertige Smartphone-Unterstützung.

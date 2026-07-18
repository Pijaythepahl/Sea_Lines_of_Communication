# Sea Lines of Communication

Rundenbasiertes maritimes Strategiespiel für Desktop und Laptop. Version 1.0.4 bietet eine vollständig deutsch- und englischsprachige Oberfläche, variable Einsatzdauer sowie Einzelspieler, lokales Pass-and-play und private Online-Partien.

## Version 1.0.4

- Die Musik folgt den strategischen Eskalationsfenstern: Stabilität bei 0–2, kontrollierte Spannung bei 3–5 und maximale Krise bei 6–8.
- Eine ruhige, stilisierte Seekarte überträgt die neue Geografie mit zwei Küstenmassen und einer zentralen Freihafeninsel in den klaren strategischen Stil der früheren Karte.
- Westliches und östliches Heimatmeer liegen als maritime Ausgangsbasen unmittelbar an den jeweiligen Küsten.
- Die getrennten Haupt-SLOCs führen über die nördlichen Passagen, das Zentralbecken und die Meridianstraße zum Freihafen.
- Die Ausweich-SLOCs umrunden die Landmassen vollständig über Wasser und passieren ihre südlichen Spitzen über den SW- beziehungsweise SO-Bogen.
- Kartenprojektion, Beschriftungen und Routenkontrast wurden für breite 16:9-Bildschirme neu abgestimmt.

## Version 1.0.3

- Die vergrößerte Seekarte nutzt den bisherigen linken Seitenbereich; die Kartenhand endet weiterhin vor der rechten Informationsspalte.
- Aktive Koalition, Staatsform, Initiative und Aktionspunkte sind in einem zugabhängig blau oder rot gefärbten strategischen Lagebalken zusammengeführt.
- Ein kompakter Übersichtsbalken zeigt Präsenz, Lagebild, Zugang, Logistik und Engpasskontrolle der aktiven Seite.
- Wirtschaftsertrag, SLOC-Prognosen und das vollständige Operationslog stehen gemeinsam in der rechten Spalte.
- Die aktuell ertragbringende SLOC wird auf der Karte durchgezogen hervorgehoben; Reserve- und blockierte Routen werden gestrichelt dargestellt.

## Version 1.0.2

- Die KI verfolgt staatsformspezifische Eskalationsstrategien: Demokratien schützen bevorzugt den Bereich 0–2, Autokratien nutzen kontrolliert den Bereich 3–5.
- Zugang, Logistik, versorgte Vorposten, alternative SLOCs und Zwei-Felder-Verlegungen fließen als zusammenhängende maritime Aufbauplanung in die KI-Bewertung ein.
- Rundenfortschritt und Punktestand verändern die Gewichtung von langfristigem Aufbau, Routendruck und Risikobereitschaft.
- Ein Changelog im Hauptmenü dokumentiert die veröffentlichten Änderungen direkt im Spiel.

## Version 1.0.1

- Blau und Rot wählen ihre Staatsform unabhängig voneinander; dadurch sind alle vier Kombinationen möglich.
- Im Online-Spiel bestimmt der Host die Staatsform für Blau. Rot wählt die eigene Staatsform nach Eingabe des Raumcodes und beide Seiten bestätigen vor dem ersten Zug die Gegenüberstellung.
- Demokratien erhalten bei Eskalation 0–2 einen Wirtschaftspunkt, Autokratien bei Eskalation 3–5; ab Eskalation 6 entfällt der Staatsformbonus.
- Vorausstationierung verstärkt das Heimatmeer oder einen über Zugang, Logistik und eine eigene SLOC versorgten Vorposten.
- Patrouillenverbände verlegen Präsenz für 1 AP ein oder zwei Regionen weit, dürfen aber keine verwehrten Zwischenräume überspringen.
- Die Führungswertung berücksichtigt den Punkteabstand pro gespielter Runde statt nur Sieg oder Niederlage.
- Das vollständige Operationslog ist scrollbar; Online-Zugwechsel werden durch einen bestätigungspflichtigen Hinweis hervorgehoben.
- Animierte SLOCs visualisieren den aktuellen Verkehrsfluss und kommen bei blockierten Routen oder Kontrollverlust zum Stillstand.

## Weitere Funktionen

- Im Hauptmenü kann jederzeit zwischen Deutsch und Englisch gewechselt werden. Die Auswahl wird lokal gespeichert und gilt im Online-PvP nur für die eigene Ansicht.
- Neue Partien können über 6, 12 oder 18 Runden gespielt werden; 6 Runden bleiben Standard und Minimum.
- 12- und 18-Runden-Partien ziehen zwei Karten je Zug und verwenden größere Decks; Patrouillenverbände sind in allen Längen häufiger vertreten.
- Zwei Karten „Zusätzliche Tonnage“ erhöhen die eigene Ausweich-SLOC für 1 AP dauerhaft bis Kapazität 5.
- Der neutrale Freihafen kann durch Projektionsüberlegenheit höchstens unter Druck gesetzt, aber nicht militärisch vollständig verwehrt werden.
- Das In-Game-Menü bündelt Hauptmenü, neue Partie und eine umfassende Hilfe; die Führungswertung erklärt ihre Teilnoten und gibt konkrete Hinweise.
- Online-Revanchen behalten Raumcode, Sitze und Koalitionen und starten erst nach Zustimmung beider Seiten.
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

## Regeln in Version 1.0.4

- Ausweich-SLOCs starten bei Kapazität 3 und können mit den beiden Karten „Zusätzliche Tonnage“ dauerhaft bis 5 ausgebaut werden.
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

Nicht enthalten sind Benutzerkonten, öffentliches Matchmaking, Ranglisten, Chat, ein realistischer Kartenhintergrund und vollwertige Smartphone-Unterstützung.

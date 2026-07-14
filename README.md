# Sea Lines of Communication

Rundenbasiertes maritimes Strategiespiel für Desktop und Laptop. MVP 3 bietet eine Einzelpartie als Blaue Koalition gegen die Rote KI sowie private Online-Partien Blau gegen Rot.

## Spielmodi

### Einzelspieler

- Der Mensch führt Blau, die KI führt Rot.
- Die KI bewertet Routenertrag, Projektion, gegnerischen Druck und Eskalationskosten.
- KI-Aktionen werden nacheinander auf der gemeinsamen Lagekarte sichtbar.
- Der Spielstand wird automatisch im Browser gespeichert.

### Online-Multiplayer

- Blau eröffnet einen privaten Raum und erhält einen sechsstelligen Einladungscode.
- Rot tritt über den Code oder einen Einladungslink bei.
- Ein Cloudflare Durable Object führt den autoritativen Spielstand und prüft jede Aktion.
- WebSockets synchronisieren Karte, Zugwechsel und Verbindungsstatus in Echtzeit.
- Die gegnerische Kartenhand und beide Nachziehstapel werden nicht an den Browser übertragen.
- Ein tabbezogenes Sitzungstoken ermöglicht die Wiederverbindung nach einem Neuladen, ohne Blau und Rot in zwei Tabs zu vermischen.

## Lokal starten

Nur die Oberfläche mit Einzelspieler:

```powershell
pnpm install
pnpm dev
```

Vollständige App einschließlich lokaler Online-Spielräume:

```powershell
pnpm install
pnpm dev:multiplayer
```

Die im Terminal angezeigte Adresse anschließend im Browser öffnen.

## Qualitätsprüfung

```powershell
pnpm test
pnpm build
```

Für einen automatischen Zwei-Spieler-Verbindungstest muss parallel `pnpm dev:multiplayer` laufen:

```powershell
pnpm test:multiplayer
```

## Cloudflare-Veröffentlichung

Das Projekt kombiniert statische Vite-Dateien mit einem Cloudflare Worker und SQLite-basierten Durable Objects:

```powershell
pnpm deploy
```

Bei einer Veröffentlichung über die Cloudflare-GitHub-Integration bleiben die Einstellungen:

- Build-Befehl: `pnpm run build`
- Deploy-Befehl: `pnpm exec wrangler deploy`
- Produktionsdateien: `dist/`

## Aktueller Umfang

- neun maritime Regionen auf einer interaktiven Hybridkarte
- Präsenz, Lagebild, Zugang, Logistik und abgeleiteter Handelsertrag
- Haupt- und Ausweich-SLOCs mit exklusiv kontrollierbarem Engpass
- identische 20-Karten-Decks für Blau und Rot
- sechs Runden, Wirtschaftsauswertung, Sieger- und Gleichstandsregeln
- globale Eskalationsleiter mit fünf strategischen Stufen
- Deeskalation über die Karte „Krisenkommunikation“
- Einzelspieler-KI für Rot
- private Online-Räume mit verdeckten Händen und Wiederverbindung

Nicht enthalten sind Benutzerkonten, öffentliches Matchmaking, Ranglisten, Chat, Fraktionsasymmetrie, Audio und vollwertige Smartphone-Unterstützung.

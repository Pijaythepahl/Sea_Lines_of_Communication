import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CARDS, RESOURCE_LABELS } from './data'
import {
  HELP_CARD_IDS,
  HELP_STRATEGIC_DISCLAIMER,
  getHelpChapters,
  getStrategists,
  type HelpChapterId,
  type StrategistId,
} from './helpContent'
import { cardText, pick, resourceText, useLanguage, type Language } from './i18n'
import type { CardDefinition, CardTarget } from './types'

const StrategicBackground = ({ ids }: { ids: StrategistId[] }) => {
  const language = useLanguage()
  const definitions = getStrategists(language)
  return <div className="strategic-background" aria-label={pick(language, 'Strategischer Designhintergrund', 'Strategic design background')}>
    <span>{pick(language, 'STRATEGISCHER HINTERGRUND', 'STRATEGIC BACKGROUND')}</span>
    <p>{ids.map((id) => <span className={`background-${id}`} key={id}><b>{definitions[id].name}:</b> {definitions[id].idea}</span>)}</p>
  </div>
}

const RulePanel = ({ title, children, tone = 'navy' }: { title: string; children: ReactNode; tone?: 'navy' | 'blue' | 'green' | 'gold' | 'red' }) => (
  <article className={`help-rule-panel tone-${tone}`}><h3>{title}</h3><div>{children}</div></article>
)

const QuickRule = ({ children }: { children: ReactNode }) => {
  const language = useLanguage()
  return <div className="help-decision-question"><span>{pick(language, 'KURZREGEL', 'QUICK RULE')}</span><strong>{children}</strong></div>
}

const TargetLabel = ({ target, language }: { target: CardTarget; language: Language }) => {
  const labels: Record<CardTarget, string> = {
    region: pick(language, '1 Region', '1 region'),
    'region-pair': pick(language, '2 Regionen', '2 regions'),
    route: pick(language, 'eigene SLOC', 'friendly SLOC'),
    'hybrid-resource': pick(language, 'Region + Ressource', 'region + resource'),
    none: pick(language, 'kein Ziel', 'no target'),
  }
  return <>{labels[target]}</>
}

const MissionChapter = () => {
  const language = useLanguage()
  return <>
    <div className="help-core-statement">
      <span>{pick(language, 'SPIELZIEL', 'OBJECTIVE')}</span>
      <strong>{pick(language, 'Nach der letzten Wertung gewinnt der höhere kumulierte Wirtschaftsertrag.', 'After the final evaluation, the higher cumulative economic Yield wins.')}</strong>
      <p>{pick(language, 'In jeder Runde erhält jede Koalition nur den Ertrag ihrer aktuell besten nutzbaren SLOC. Die Karte misst regionale Nutzbarkeit und keine territorialen Besitzverhältnisse.', 'In each round, each coalition receives only the Yield of its currently best usable SLOC. The chart measures regional usability, not territorial ownership.')}</p>
    </div>
    <div className="help-step-grid four-steps">
      {[
        [pick(language, 'Partie wählen', 'Choose a game'), pick(language, 'Spielmodus, 6/12/18 Runden und beide Staatsformen festlegen.', 'Set game mode, 6/12/18 rounds, and both governments.')],
        [pick(language, 'Karten spielen', 'Play cards'), pick(language, 'Jede Seite verfügt pro Zug über 3 AP und wählt die geforderten Ziele auf der Karte.', 'Each side has 3 AP per turn and selects the required targets on the chart.')],
        [pick(language, 'SLOCs werten', 'Evaluate SLOCs'), pick(language, 'Nach beiden Zügen werden verdeckte Aufträge und anschließend beide besten SLOCs ausgewertet.', 'After both turns, covert operations and then both best SLOCs are evaluated.')],
        [pick(language, 'Spiel abschließen', 'Finish the game'), pick(language, 'Gesamtertrag entscheidet; bei Gleichstand folgen Schlussrunde und Kernraumprojektion.', 'Total Yield decides; ties use the final round and core-region Projection.')],
      ].map(([title, text], index) => <article key={title}><b>{String(index + 1).padStart(2, '0')}</b><strong>{title}</strong><p>{text}</p></article>)}
    </div>
    <div className="help-rule-grid three-columns">
      <RulePanel title={pick(language, 'Spielmodi', 'Game modes')} tone="blue"><p>{pick(language, 'Einzelspieler gegen die rote KI, lokales Pass-and-play oder private Online-Partie per Raumcode. Hände und verdeckte Aufträge bleiben in beiden PvP-Modi geschützt.', 'Single player against Red AI, local pass-and-play, or a private online game by room code. Hands and covert operations remain protected in both PvP modes.')}</p></RulePanel>
      <RulePanel title={pick(language, 'Einsatzdauer', 'Campaign length')} tone="gold"><p>{pick(language, '6, 12 oder 18 Wertungen. Längere Partien ziehen pro Zug zwei statt einer Karte; das Handlimit bleibt 7.', '6, 12, or 18 evaluations. Longer games draw two cards per turn instead of one; the hand limit remains 7.')}</p></RulePanel>
      <RulePanel title={pick(language, 'Staatsformen', 'Governments')} tone="red"><p>{pick(language, 'Demokratien erhalten +1 Ertrag bei Eskalation 0–2, Autokratien bei 3–5. Ab Eskalation 6 entfällt jeder Staatsformbonus.', 'Democracies gain +1 Yield at Escalation 0–2, Autocracies at 3–5. From Escalation 6 onward, all government bonuses cease.')}</p></RulePanel>
    </div>
    <QuickRule>{pick(language, 'Pro Wertung zählt je Koalition genau eine Route: die nutzbare eigene SLOC mit dem höchsten Ertrag.', 'Exactly one route scores per coalition at each evaluation: the usable friendly SLOC with the highest Yield.')}</QuickRule>
  </>
}

const TurnChapter = () => {
  const language = useLanguage()
  return <>
    <div className="help-turn-flow">
      {[
        [pick(language, 'Erster Zug', 'First turn'), pick(language, 'Die Startseite zieht Karten, spielt Aktionen und beendet den Zug.', 'The starting side draws cards, plays actions, and ends the turn.'), pick(language, '3 AP · Karte → Ziel → Wirkung', '3 AP · Card → target → effect')],
        [pick(language, 'Zweiter Zug', 'Second turn'), pick(language, 'Die andere Koalition reagiert mit eigener Hand und vollen 3 AP.', 'The other coalition responds with its own hand and a full 3 AP.'), pick(language, 'Initiative wechselt je Runde', 'Initiative alternates each round')],
        [pick(language, 'Wertung', 'Evaluation'), pick(language, 'Verdeckte Aufträge wirken. Danach zählt je Seite die beste nutzbare SLOC.', 'Covert operations resolve. Then each side scores its best usable SLOC.'), pick(language, 'Ertrag · Eskalation · Ruhe', 'Yield · Escalation · Restraint')],
      ].map(([title, text, note], index) => <article key={title}><b>{String(index + 1).padStart(2, '0')}</b><h3>{title}</h3><p>{text}</p><small>{note}</small></article>)}
    </div>
    <div className="help-rule-grid three-columns">
      <RulePanel title={pick(language, 'Eine Aktion ausführen', 'Take an action')} tone="blue"><ol><li>{pick(language, 'Karte wählen; die Zahl zeigt den AP-Preis.', 'Choose a card; the number shows its AP cost.')}</li><li>{pick(language, 'Gültige Region, Route, Ressource oder ein zweites Feld wählen.', 'Choose a valid region, route, resource, or second region.')}</li><li>{pick(language, 'Offen/ver­deckt und bei Hybridem Druck Zugang/Logistik konfigurieren.', 'Configure open/covert and, for Hybrid Pressure, Access/Logistics.')}</li><li>{pick(language, 'Wirkung bestätigen oder die Auswahl abbrechen.', 'Confirm the effect or cancel the selection.')}</li></ol></RulePanel>
      <RulePanel title={pick(language, 'Die Oberfläche lesen', 'Read the interface')} tone="green"><ul><li>{pick(language, 'Der Lagebalken zeigt aktive Koalition, Staatsform, Initiative und AP.', 'The situation bar shows active coalition, government, initiative, and AP.')}</li><li>{pick(language, 'Regionen zeigen den Status aus Sicht der aktiven Seite; alle vier SLOCs bleiben gleichzeitig sichtbar.', 'Regions show status from the active side’s perspective; all four SLOCs remain visible.')}</li><li>{pick(language, 'Die rechte Spalte zeigt Punktestand, Live-Prognosen und das vollständige Operationslog.', 'The right column shows score, live forecasts, and the full operations log.')}</li></ul></RulePanel>
      <RulePanel title={pick(language, 'Hand, Deck und Initiative', 'Hand, deck, and initiative')} tone="gold"><ul><li>{pick(language, 'Beide Seiten starten mit 5 Karten; das Handlimit ist 7.', 'Both sides start with 5 cards; the hand limit is 7.')}</li><li>{pick(language, 'Bei 6 Runden wird zu Zugbeginn 1 Karte gezogen, bei 12 oder 18 Runden werden 2 gezogen.', 'At 6 rounds, draw 1 card at the start of a turn; at 12 or 18 rounds, draw 2.')}</li><li>{pick(language, 'Blau beginnt ungerade Runden, Rot gerade Runden. Deckgrößen: 24 / 34 / 44 Karten.', 'Blue starts odd rounds; Red starts even rounds. Deck sizes: 24 / 34 / 44 cards.')}</li><li>{pick(language, 'Patrouillenverbände sind häufiger enthalten; Zusätzliche Tonnage liegt genau zweimal im Deck.', 'Patrol Groups appear more often; Additional Tonnage appears exactly twice in the deck.')}</li></ul></RulePanel>
    </div>
    <div className="help-merksatz"><span>{pick(language, 'RUHEBONUS', 'RESTRAINT BONUS')}</span><strong>{pick(language, '+1 Ertrag bei mindestens 1 Rest-AP, sofern die Seite in dieser Runde keine offene Eskalation erzeugt und keinen verdeckten Auftrag vorbereitet hat.', '+1 Yield with at least 1 AP left, provided the side generated no open Escalation and prepared no covert operation this round.')}</strong></div>
    <QuickRule>{pick(language, 'Nach dem zweiten Zug werden zuerst alle verdeckten Aufträge aufgelöst und danach beide Seiten gemeinsam gewertet.', 'After the second turn, all covert operations resolve first; then both sides are evaluated together.')}</QuickRule>
  </>
}

const MapChapter = () => {
  const language = useLanguage()
  return <>
    <div className="help-core-statement compact">
      <span>{pick(language, 'REGIONSSTATUS', 'REGION STATUS')}</span>
      <strong>{pick(language, 'Räume wechseln nicht den Besitzer. Jede Seite prüft ihre Nutzbarkeit separat.', 'Regions do not change ownership. Each side checks its usability separately.')}</strong>
    </div>
    <div className="help-geography-grid">
      {[
        [pick(language, 'Ausgangsräume', 'Home regions'), pick(language, 'Westliches und östliches Randmeer verankern Zugang, Logistik und die eigenen SLOCs.', 'Western and Eastern Littoral Seas anchor Access, Logistics, and friendly SLOCs.'), 'blue'],
        [pick(language, 'Gemeinsamer Kern', 'Shared core'), pick(language, 'Zentralbecken und Meridianstraße liegen auf beiden Hauptrouten und werden zum operativen Schwerpunkt.', 'Central Basin and Meridian Strait lie on both main routes and become the operational focus.'), 'green'],
        [pick(language, 'Neutraler Markt', 'Neutral market'), pick(language, 'Der Freihafen bleibt militärisch höchstens unter Druck, benötigt aber weiterhin eigenen aktiven Zugang.', 'Freeport can at most be contested militarily, but still requires active friendly Access.'), 'gold'],
        [pick(language, 'Alternative Geografie', 'Alternative geography'), pick(language, 'Die südlichen Bögen umgehen die Meridianstraße mit geringerer Kapazität.', 'The southern arcs bypass Meridian Strait at lower capacity.'), 'red'],
      ].map(([title, text, tone]) => <article className={`geo-${tone}`} key={title}><h3>{title}</h3><p>{text}</p></article>)}
    </div>
    <div className="help-rule-grid two-columns">
      <RulePanel title={pick(language, 'Getrennte Perspektiven', 'Separate perspectives')} tone="green"><p>{pick(language, 'Dieselbe Region kann für beide Seiten frei sein, wenn ihre Projektion gleich hoch ist. Statusanzeigen bewerten daher keine Besitzverhältnisse.', 'The same region can be open to both sides when their Projection is equal. Status indicators therefore do not represent ownership.')}</p></RulePanel>
      <RulePanel title={pick(language, 'Startaufstellung', 'Starting setup')} tone="red"><p>{pick(language, 'Blau startet im Westlichen Randmeer mit Präsenz 2, Lagebild 1, Zugang 2 und Logistik 2; in der Nordwestpassage mit 1 / 1 / 0 / 1. Rot beginnt spiegelbildlich im Östlichen Randmeer und in der Nordostpassage. Beide Seiten besitzen im Freihafen 1 Zugang.', 'Blue starts in the Western Littoral Sea with Presence 2, Awareness 1, Access 2, and Logistics 2; in Northwest Passage with 1 / 1 / 0 / 1. Red starts mirrored in the Eastern Littoral Sea and Northeast Passage. Both sides have 1 Access at Freeport.')}</p></RulePanel>
    </div>
    <QuickRule>{pick(language, 'Für Status, SLOC und Kartenbedingungen zählt immer die Perspektive der betroffenen Seite – nicht die Farbe oder Lage eines Raumes.', 'For status, SLOCs, and card conditions, always use the affected side’s perspective—not a region’s colour or location.')}</QuickRule>
  </>
}

const ProjectionChapter = () => {
  const language = useLanguage()
  const explanations = {
    presence: pick(language, 'Sichtbare Kräfte schaffen Reaktionsfähigkeit und politischen Druck.', 'Visible forces create responsiveness and political pressure.'),
    awareness: pick(language, 'Aufklärung macht Aktivitäten sichtbar, zuordenbar und beobachtbar.', 'Reconnaissance makes activity visible, attributable, and observable.'),
    access: pick(language, 'Politische und rechtliche Nutzung öffnet Häfen und regionale Positionen.', 'Political and legal use opens ports and regional positions.'),
    logistics: pick(language, 'Versorgung und Stützpunkte machen maritime Präsenz dauerhaft.', 'Supply and bases make maritime presence persistent.'),
  }
  return <>
    <div className="help-resource-grid">
      {(Object.keys(explanations) as Array<keyof typeof explanations>).map((resource) => <article className={`resource-${resource}`} key={resource}>
        <span>{resourceText(resource, language).short}</span><h3>{resourceText(resource, language).name}</h3><b>{pick(language, 'Maximum', 'Maximum')} {RESOURCE_LABELS[resource].max}</b><p>{explanations[resource]}</p>
      </article>)}
    </div>
    <div className="help-formula"><span>{pick(language, 'BERECHNUNG JE REGION UND SEITE', 'CALCULATED FOR EACH REGION AND SIDE')}</span><strong>{pick(language, 'Präsenz + Lagebild + Zugang + Logistik = Projektion', 'Presence + Awareness + Access + Logistics = Projection')}</strong><p>{pick(language, 'Vergleiche anschließend beide Seiten im selben Raum.', 'Then compare both sides in the same region.')}</p></div>
    <div className="help-status-grid">
      <article className="status-free"><h3>{pick(language, 'Frei', 'Open')}</h3><strong>{pick(language, 'Eigene Projektion ≥ Gegner', 'Friendly Projection ≥ opponent')}</strong><p>{pick(language, 'Kein zusätzlicher SLOC-Malus.', 'No additional SLOC penalty.')}</p></article>
      <article className="status-contested"><h3>{pick(language, 'Unter Druck', 'Contested')}</h3><strong>{pick(language, '1–2 Punkte zurück', '1–2 points behind')}</strong><p>{pick(language, '−1 Ertrag je betroffener Region.', '−1 Yield per affected region.')}</p></article>
      <article className="status-denied"><h3>{pick(language, 'Verwehrt', 'Denied')}</h3><strong>{pick(language, 'Mindestens 3 Punkte zurück', 'At least 3 points behind')}</strong><p>{pick(language, 'SLOCs durch diese Region sind geschlossen.', 'SLOCs through this region are closed.')}</p></article>
    </div>
    <div className="help-rule-grid two-columns">
      <RulePanel title={pick(language, 'Temporär und effektiv', 'Temporary and effective')} tone="green"><ul><li>{pick(language, 'Ein Patrouillenverband stellt am Ziel bis zur Wertung ein nicht stapelbares Lagebild von mindestens 1 her.', 'A Patrol Group establishes non-stacking Awareness of at least 1 at its destination until evaluation.')}</li><li>{pick(language, 'Beschattung kann dauerhaftes oder temporäres Lagebild reduzieren.', 'Shadowing can reduce permanent or temporary Awareness.')}</li><li>{pick(language, 'Hybrider Druck suspendiert Zugang oder Logistik bis zur Wertung.', 'Hybrid Pressure suspends Access or Logistics until evaluation.')}</li></ul></RulePanel>
      <RulePanel title={pick(language, 'Versorgter Vorposten', 'Supplied outpost')} tone="red"><p>{pick(language, 'Vorausstationierung außerhalb des Heimatmeers benötigt aktiven Zugang, aktive Logistik und einen nicht verwehrten Abschnitt einer eigenen SLOC zurück zum Heimatmeer.', 'Forward Deployment outside the home sea requires active Access, active Logistics, and a non-denied segment of a friendly SLOC back to the home sea.')}</p></RulePanel>
    </div>
    <QuickRule>{pick(language, 'Gleichstand ist frei, 1–2 Punkte Rückstand bedeuten unter Druck, ab 3 Punkten Rückstand ist die Region verwehrt.', 'A tie is open, a 1–2 point deficit is contested, and a deficit of 3 or more makes the region denied.')}</QuickRule>
  </>
}

const SlocChapter = () => {
  const language = useLanguage()
  return <>
    <div className="help-route-comparison">
      <article className="main-route"><span>{pick(language, 'HAUPT-SLOC', 'MAIN SLOC')}</span><strong>{pick(language, 'Kapazität 6', 'Capacity 6')}</strong><p>{pick(language, 'Kurzer, leistungsfähiger Korridor über Zentralbecken und Meridianstraße – abhängig von günstiger Position.', 'Short, capable corridor through Central Basin and Meridian Strait—dependent on favourable position.')}</p></article>
      <article className="detour-route"><span>{pick(language, 'AUSWEICH-SLOC', 'DETOUR SLOC')}</span><strong>{pick(language, 'Kapazität 3 → 5', 'Capacity 3 → 5')}</strong><p>{pick(language, 'Länger und anfangs schwächer, aber unabhängig von gegnerischer Engpasskontrolle.', 'Longer and initially weaker, but independent of opposing chokepoint control.')}</p></article>
    </div>
    <div className="help-route-paths">
      <p><b>{pick(language, 'Blau Haupt:', 'Blue Main:')}</b> {pick(language, 'Randmeer West → NW-Passage → Zentralbecken → Meridianstraße → Freihafen', 'Western Littoral → NW Passage → Central Basin → Meridian Strait → Freeport')}</p>
      <p><b>{pick(language, 'Rot Haupt:', 'Red Main:')}</b> {pick(language, 'Randmeer Ost → NO-Passage → Zentralbecken → Meridianstraße → Freihafen', 'Eastern Littoral → NE Passage → Central Basin → Meridian Strait → Freeport')}</p>
      <p><b>{pick(language, 'Ausweichrouten:', 'Detours:')}</b> {pick(language, 'eigenes Randmeer → eigener südlicher Bogen → Freihafen', 'friendly Littoral → friendly southern arc → Freeport')}</p>
    </div>
    <div className="help-rule-grid two-columns">
      <RulePanel title={pick(language, 'Wann ist eine SLOC geschlossen?', 'When is a SLOC closed?')} tone="red"><ul><li>{pick(language, 'Kein aktiver eigener Zugang im Ausgangsraum oder im Freihafen.', 'No active friendly Access in the origin or at Freeport.')}</li><li>{pick(language, 'Mindestens eine durchquerte Region ist für die Seite verwehrt.', 'At least one traversed region is denied to the side.')}</li><li>{pick(language, 'Die gegnerische Seite kontrolliert die Meridianstraße; dies schließt nur die Haupt-SLOC.', 'The opponent controls Meridian Strait; this closes only the Main SLOC.')}</li></ul></RulePanel>
      <RulePanel title={pick(language, 'Engpasskontrolle', 'Chokepoint control')} tone="gold"><p>{pick(language, 'In der Meridianstraße werden mindestens 2 Punkte Projektionsvorsprung, 2 Präsenz und 1 aktiver Zugang benötigt. Die Ausweich-SLOC bleibt davon unberührt.', 'Meridian Strait requires at least a 2-point Projection lead, 2 Presence, and 1 active Access. The Detour SLOC remains unaffected.')}</p></RulePanel>
    </div>
    <div className="help-formula route-formula"><span>{pick(language, 'ROUTENERTRAG', 'ROUTE YIELD')}</span><strong>{pick(language, 'Kapazität − Druck − Eskalation − eigene Verantwortung', 'Capacity − pressure − Escalation − own responsibility')}</strong><b>{pick(language, '+ Staatsformbonus + Ruhebonus', '+ government bonus + Restraint bonus')}</b></div>
    <div className="help-modifier-grid">
      <article><b>{pick(language, 'Druck', 'Pressure')}</b><p>{pick(language, '−1 je umkämpfter Region; Konvoisicherung hebt bei der nächsten Wertung genau einen solchen Malus auf.', '−1 per contested region; Convoy Escort removes exactly one such penalty at the next evaluation.')}</p></article>
      <article><b>{pick(language, 'Globale Eskalation', 'Global Escalation')}</b><p>{pick(language, '0 bei 0–1 · −1 bei 2–3 · −2 bei 4–5 · −3 bei 6–7.', '0 at 0–1 · −1 at 2–3 · −2 at 4–5 · −3 at 6–7.')}</p></article>
      <article><b>{pick(language, 'Eigene Verantwortung', 'Own responsibility')}</b><p>{pick(language, 'Jeder offen erzeugte Eskalationspunkt der Seite kostet in derselben Runde zusätzlich 1 Ertrag.', 'Each openly generated Escalation point by the side additionally costs 1 Yield that round.')}</p></article>
      <article><b>{pick(language, 'Ruhe', 'Restraint')}</b><p>{pick(language, '+1 bei mindestens 1 Rest-AP, ohne eigene offene Eskalation und ohne verdeckten Auftrag – auch wenn beide SLOCs geschlossen sind.', '+1 with at least 1 remaining AP, no friendly open escalation, and no covert operation—even if both SLOCs are closed.')}</p></article>
    </div>
    <div className="help-example"><span>{pick(language, 'BEISPIEL', 'EXAMPLE')}</span><p>{pick(language, 'Haupt-SLOC 6, eine Region unter Druck, Eskalation 2 und Demokratie: 6 − 1 − 1 + 1 = 5 Ertrag, sofern keine eigene Verantwortung hinzukommt.', 'Main SLOC 6, one contested region, Escalation 2, and Democracy: 6 − 1 − 1 + 1 = 5 Yield, provided no own responsibility is added.')}</p></div>
    <QuickRule>{pick(language, 'Das Spiel vergleicht Haupt- und Ausweich-SLOC automatisch und wertet nur die höhere nutzbare Route; bei gleicher Höhe bleibt das Ergebnis identisch.', 'The game automatically compares Main and Detour SLOC and scores only the higher usable route; a tie produces the same result.')}</QuickRule>
  </>
}

const CardsChapter = () => {
  const language = useLanguage()
  return <>
    <div className="help-rule-grid three-columns">
      <RulePanel title={pick(language, 'Kosten und Ziel', 'Cost and target')} tone="blue"><p>{pick(language, 'Die Zahl oben rechts ist der AP-Preis. Nach der Kartenwahl fordert das Spiel je nach Karte eine Region, zwei Regionen, eine eigene SLOC oder Region plus Ressource an.', 'The number at top right is the AP cost. After choosing a card, the game requests a region, two regions, a friendly SLOC, or a region plus resource as required.')}</p></RulePanel>
      <RulePanel title={pick(language, 'Voraussetzungen', 'Requirements')} tone="green"><p>{pick(language, 'Nicht bezahlbare Karten und unzulässige Ziele sind deaktiviert. Der Hinweis an Karte oder Ziel nennt die fehlende Voraussetzung; eine begonnene Auswahl kann abgebrochen werden.', 'Unaffordable cards and illegal targets are disabled. The hint on the card or target names the missing requirement; a started selection can be cancelled.')}</p></RulePanel>
      <RulePanel title={pick(language, 'Eskalation und Geheimhaltung', 'Escalation and secrecy')} tone="red"><p>{pick(language, 'Das Warnsymbol zeigt offene Eskalation. Nur Beschattung und Hybrider Druck können gegen +1 AP verdeckt vorbereitet werden, wenn die Lagebild-Voraussetzungen erfüllt sind.', 'The warning symbol shows open Escalation. Only Shadowing and Hybrid Pressure can be prepared covertly for +1 AP when Awareness requirements are met.')}</p></RulePanel>
    </div>
    <div className="help-card-reference">
      {HELP_CARD_IDS.map((cardId) => {
        const card: CardDefinition = cardText(cardId, language)
        return <article key={cardId}>
          <div className="help-card-heading"><span>{CARDS[cardId].icon}</span><div><small>{card.domain}</small><h3>{card.title}</h3></div><b>{card.cost} AP</b></div>
          <p>{card.description}</p>
          <dl><div><dt>{pick(language, 'Ziel', 'Target')}</dt><dd><TargetLabel target={card.target} language={language} /></dd></div><div><dt>{pick(language, 'Offene Eskalation', 'Open Escalation')}</dt><dd>{card.escalation > 0 ? `+${card.escalation}` : pick(language, 'keine', 'none')}</dd></div></dl>
          <small className="help-card-hint">{card.playHint}</small>
        </article>
      })}
    </div>
    <QuickRule>{pick(language, 'Kartentext, Zielhinweis und Vorschau sind verbindlich: Erst Bestätigen löst die Aktion aus und bezahlt die AP.', 'Card text, target hint, and preview are authoritative: only Confirm resolves the action and pays its AP cost.')}</QuickRule>
  </>
}

const CrisisChapter = () => {
  const language = useLanguage()
  return <>
    <div className="help-escalation-bands">
      {[
        ['0–1', pick(language, 'Stabilität', 'Stability'), '0'],
        ['2–3', pick(language, 'Spannung', 'Tension'), '−1'],
        ['4–5', pick(language, 'Krise', 'Crisis'), '−2'],
        ['6–7', pick(language, 'Konfrontation', 'Confrontation'), '−3'],
        ['8', pick(language, 'Kontrollverlust', 'Loss of Control'), '−1/−2'],
      ].map(([level, label, penalty]) => <article key={level}><strong>{level}</strong><span>{label}</span><b>{penalty}</b></article>)}
    </div>
    <div className="government-reference">
      <div className="government-reference-heading"><span>{pick(language, 'STAATSFORMEN UND ESKALATION', 'GOVERNMENTS AND ESCALATION')}</span><strong>{pick(language, 'Der Bonus gilt für den Ertrag der gewerteten SLOC.', 'The bonus applies to the Yield of the scored SLOC.')}</strong></div>
      <div className="government-table" role="table" aria-label={pick(language, 'Staatsformboni nach Eskalationswert', 'Government bonuses by Escalation level')}>
        <div className="government-table-row table-head" role="row"><b role="columnheader">{pick(language, 'Eskalation', 'Escalation')}</b><span role="columnheader">0–1</span><span role="columnheader">2</span><span role="columnheader">3</span><span role="columnheader">4–5</span><span role="columnheader">6–7</span><span role="columnheader">8</span></div>
        <div className="government-table-row" role="row"><b role="rowheader">{pick(language, 'Globaler Malus', 'Global penalty')}</b><span>0</span><span>−1</span><span>−1</span><span>−2</span><span>−3</span><span>{pick(language, 'Sonderfall', 'Special')}</span></div>
        <div className="government-table-row democracy-row" role="row"><b role="rowheader">{pick(language, 'Demokratie', 'Democracy')}</b><span>+1</span><span>+1</span><span>0</span><span>0</span><span>0</span><span>0</span></div>
        <div className="government-table-row autocracy-row" role="row"><b role="rowheader">{pick(language, 'Autokratie', 'Autocracy')}</b><span>0</span><span>0</span><span>+1</span><span>+1</span><span>0</span><span>0</span></div>
      </div>
      <div className="government-rationale">
        <article className="democracy-rationale"><h3>{pick(language, 'Demokratie: Vorteil bei 0–2', 'Democracy: advantage at 0–2')}</h3><p>{pick(language, 'Die Spielabstraktion belohnt Marktvertrauen, berechenbare Regeln, offene Handelsnetze und tragfähige Koalitionen in einem stabilen Umfeld mit +1 Ertrag.', 'The game abstraction rewards market confidence, predictable rules, open trade networks, and durable coalitions in a stable environment with +1 Yield.')}</p></article>
        <article className="autocracy-rationale"><h3>{pick(language, 'Autokratie: Vorteil bei 3–5', 'Autocracy: advantage at 3–5')}</h3><p>{pick(language, 'Bei kontrollierter Spannung bildet +1 Ertrag die kurzfristige Stärke zentraler Priorisierung ab: Häfen, Logistik und Kapazitäten können gebündelt mobilisiert werden.', 'Under controlled tension, +1 Yield represents the short-term strength of central prioritisation: ports, logistics, and capacity can be mobilised in a concentrated way.')}</p></article>
        <article className="crisis-rationale"><h3>{pick(language, 'Ab 6: kein Staatsformbonus', 'From 6: no government bonus')}</h3><p>{pick(language, 'Systemische Krisenkosten, Versicherungsrisiken und unterbrochene Lieferketten überlagern beide institutionellen Stärken. Bei 8 gilt Kontrollverlust: −1 Ertrag, bei eigener Verantwortung −2.', 'Systemic crisis costs, insurance risks, and disrupted supply chains overwhelm both institutional strengths. At 8, Loss of Control applies: −1 Yield, or −2 with own responsibility.')}</p></article>
      </div>
      <p className="government-disclaimer">{pick(language, 'Diese Wirkungsfenster sind eine didaktische Spielannahme und keine allgemeine Bewertung politischer Systeme.', 'These resilience windows are a teaching abstraction, not a general judgement of political systems.')}</p>
    </div>
    <div className="help-rule-grid two-columns">
      <RulePanel title={pick(language, 'Globale Krise', 'Global crisis')} tone="gold"><p>{pick(language, 'Der Eskalationsbereich reduziert den Ertrag aller weiterhin nutzbaren SLOCs, unabhängig davon, wer ihn verursacht hat.', 'The Escalation band reduces the Yield of every still-usable SLOC, regardless of who caused it.')}</p></RulePanel>
      <RulePanel title={pick(language, 'Eigene Verantwortung', 'Own responsibility')} tone="red"><p>{pick(language, 'Jeder offen erzeugte Eskalationspunkt kostet den Auslöser in derselben Wertung zusätzlich. Bei Eskalation 8 endet die normale SLOC-Rechnung: −1, beziehungsweise −2 bei eigener Verantwortung.', 'Each openly generated Escalation point additionally costs its author in the same evaluation. At Escalation 8, normal SLOC calculation ends: −1, or −2 with own responsibility.')}</p></RulePanel>
    </div>
    <div className="help-open-covert">
      <article className="open-operation"><span>{pick(language, 'OFFEN', 'OPEN')}</span><h3>{pick(language, 'Sofort sichtbar und wirksam', 'Visible and effective immediately')}</h3><ul><li>{pick(language, 'Normale AP-Kosten.', 'Normal AP cost.')}</li><li>{pick(language, 'Die auf der Karte angegebene Eskalation steigt sofort.', 'The Escalation printed on the card rises immediately.')}</li><li>{pick(language, 'Die Aktion zählt als eigene Verantwortung.', 'The action counts as own responsibility.')}</li></ul></article>
      <article className="covert-operation"><span>{pick(language, 'VERDECKT', 'COVERT')}</span><h3>{pick(language, 'Später wirksam, Details verborgen', 'Effective later, details hidden')}</h3><ul><li>{pick(language, '+1 AP; eigenes Lagebild mindestens 1, gegnerisches höchstens 1.', '+1 AP; friendly Awareness at least 1, opposing Awareness at most 1.')}</li><li>{pick(language, 'Nur Beschattung und Hybrider Druck können verdeckt vorbereitet werden.', 'Only Shadowing and Hybrid Pressure can be prepared covertly.')}</li><li>{pick(language, 'Keine offene Eskalation, aber kein Ruhebonus und keine automatische Beruhigung.', 'No open Escalation, but no Restraint bonus and no automatic calming.')}</li></ul></article>
    </div>
    <div className="help-rule-grid two-columns">
      <RulePanel title={pick(language, 'Simultane Auflösung', 'Simultaneous resolution')} tone="navy"><p>{pick(language, 'Alle verdeckten Aufträge werden vor der Wertung aus derselben Ausgangslage geprüft. Fehlt dann die gegnerische Ressource oder das Lagebild, kann ein Auftrag wirkungslos bleiben.', 'All covert operations are checked before evaluation from the same starting position. If the opposing resource or Awareness is then absent, an operation can have no effect.')}</p></RulePanel>
      <RulePanel title={pick(language, 'Beruhigung', 'Calming')} tone="green"><p>{pick(language, 'Krisenkommunikation senkt Eskalation sofort um 1. Erzeugt keine Seite offene Eskalation oder einen verdeckten Auftrag, sinkt sie nach der Wertung automatisch um 1.', 'Crisis Communications immediately lowers Escalation by 1. If neither side generates open Escalation or a covert operation, it automatically falls by 1 after evaluation.')}</p></RulePanel>
    </div>
    <QuickRule>{pick(language, 'Bei 0–2 erhält nur die Demokratie +1; bei 3–5 nur die Autokratie. Ab 6 erhält keine Staatsform einen Bonus – ein zusätzlicher staatsformspezifischer Malus existiert nicht.', 'At 0–2 only Democracy gains +1; at 3–5 only Autocracy does. From 6 onward neither government gains a bonus—there is no additional government-specific penalty.')}</QuickRule>
  </>
}

const LeadershipChapter = () => {
  const language = useLanguage()
  return <>
    <div className="help-core-statement compact">
      <span>{pick(language, 'ZWEI GETRENNTE ERGEBNISSE', 'TWO SEPARATE RESULTS')}</span><strong>{pick(language, 'Der Spielsieg folgt dem Wirtschaftsertrag. Die Führungswertung beurteilt zusätzlich Kosten und Verantwortung.', 'Victory follows economic Yield. The leadership rating additionally assesses cost and responsibility.')}</strong>
    </div>
    <div className="help-rule-grid two-columns">
      <RulePanel title={pick(language, 'Wer gewinnt?', 'Who wins?')} tone="blue"><ol><li>{pick(language, 'Höherer Gesamtertrag nach 6, 12 oder 18 Wertungen.', 'Higher total Yield after 6, 12, or 18 evaluations.')}</li><li>{pick(language, 'Bei Gleichstand: höherer Ertrag in der Schlussrunde.', 'If tied: higher Yield in the final round.')}</li><li>{pick(language, 'Danach: stärkere Gesamtprojektion in Zentralbecken, Meridianstraße und Freihafen.', 'Then: stronger total Projection in Central Basin, Meridian Strait, and Freeport.')}</li><li>{pick(language, 'Bleibt auch das gleich, endet die Partie unentschieden.', 'If that too is equal, the game ends in a draw.')}</li></ol></RulePanel>
      <RulePanel title={pick(language, 'Wie entstehen die Sterne?', 'How are stars awarded?')} tone="gold"><p>{pick(language, 'Ergebnis liefert 0–4 Punkte; Wirtschaft, durchschnittliche Eskalation und Verantwortung jeweils 0–2. Die Summe wird durch 2 geteilt und aufgerundet; mindestens 1 Stern wird vergeben.', 'Result contributes 0–4 points; Economy, average Escalation, and Responsibility contribute 0–2 each. Divide the total by 2 and round up; at least 1 star is awarded.')}</p></RulePanel>
    </div>
    <div className="leadership-thresholds">
      <article><span>{pick(language, 'ERGEBNIS · MAX. 4', 'RESULT · MAX. 4')}</span><p>{pick(language, '2 + eigener Ertragsvorsprung je Runde; bei Rückstand wird der Abstand abgezogen. Der Wert wird auf 0–4 begrenzt.', '2 + own Yield lead per round; a deficit is subtracted. The value is limited to 0–4.')}</p></article>
      <article><span>{pick(language, 'WIRTSCHAFT · MAX. 2', 'ECONOMY · MAX. 2')}</span><p>{pick(language, 'Ø-Ertrag ≥ 5: 2 · ≥ 4: 1,5 · ≥ 3: 1 · ≥ 2: 0,5 · darunter: 0.', 'Average Yield ≥ 5: 2 · ≥ 4: 1.5 · ≥ 3: 1 · ≥ 2: 0.5 · below: 0.')}</p></article>
      <article><span>{pick(language, 'ESKALATION · MAX. 2', 'ESCALATION · MAX. 2')}</span><p>{pick(language, 'Ø-Eskalation ≤ 1: 2 · ≤ 3: 1,5 · ≤ 5: 1 · ≤ 7: 0,5 · darüber: 0.', 'Average Escalation ≤ 1: 2 · ≤ 3: 1.5 · ≤ 5: 1 · ≤ 7: 0.5 · above: 0.')}</p></article>
      <article><span>{pick(language, 'VERANTWORTUNG · MAX. 2', 'RESPONSIBILITY · MAX. 2')}</span><p>{pick(language, 'Netto = eigene Eskalationspunkte minus gespielte Krisenkommunikation, mindestens 0. Netto 0: 2 · bis ⅓ der Rundenzahl: 1,5 · bis ⅔: 1 · bis zur Rundenzahl: 0,5 · darüber: 0.', 'Net = own Escalation points minus Crisis Communications played, minimum 0. Net 0: 2 · up to ⅓ of rounds: 1.5 · up to ⅔: 1 · up to the round count: 0.5 · above: 0.')}</p></article>
    </div>
    <QuickRule>{pick(language, 'Ein wirtschaftlicher Sieg garantiert keine hohe Führungswertung; eine unterlegene Seite kann verantwortungsvoller geführt worden sein.', 'An economic victory does not guarantee a high leadership rating; the losing side may have been led more responsibly.')}</QuickRule>
  </>
}

const ChapterContent = ({ chapterId }: { chapterId: HelpChapterId }) => {
  if (chapterId === 'mission') return <MissionChapter />
  if (chapterId === 'turn') return <TurnChapter />
  if (chapterId === 'map') return <MapChapter />
  if (chapterId === 'projection') return <ProjectionChapter />
  if (chapterId === 'slocs') return <SlocChapter />
  if (chapterId === 'cards') return <CardsChapter />
  if (chapterId === 'crisis') return <CrisisChapter />
  return <LeadershipChapter />
}

export const HelpDialog = ({ onClose }: { onClose: () => void }) => {
  const language = useLanguage()
  const chapters = getHelpChapters(language)
  const [activeId, setActiveId] = useState<HelpChapterId>('mission')
  const dialogRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const activeChapter = chapters.find((chapter) => chapter.id === activeId) ?? chapters[0]

  useEffect(() => {
    dialogRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const selectChapter = (chapterId: HelpChapterId) => {
    setActiveId(chapterId)
    contentRef.current?.scrollTo({ top: 0 })
  }

  return <div className="modal-backdrop rules-backdrop help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" tabIndex={-1}>
      <header>
        <div><span className="eyebrow">{pick(language, 'SPIELANLEITUNG · VERSION 1.0.6', 'GAME GUIDE · VERSION 1.0.6')}</span><h2 id="help-title">{pick(language, 'Spielanleitung & Regelreferenz', 'Game guide & rules reference')}</h2></div>
        <button type="button" onClick={onClose} aria-label={pick(language, 'Anleitung schließen', 'Close guide')}>×</button>
      </header>
      <div className="help-layout">
        <nav className="help-navigation" aria-label={pick(language, 'Kapitel der Spielanleitung', 'Game guide chapters')}>
          <span>{pick(language, 'KAPITEL', 'CHAPTERS')}</span>
          {chapters.map((chapter, index) => <button type="button" key={chapter.id} className={chapter.id === activeId ? 'active' : ''} aria-current={chapter.id === activeId ? 'page' : undefined} onClick={() => selectChapter(chapter.id)}>
            <b>{String(index + 1).padStart(2, '0')}</b><span>{chapter.navLabel}</span>
          </button>)}
          <p>{HELP_STRATEGIC_DISCLAIMER(language)}</p>
        </nav>
        <div className="help-content" ref={contentRef} id="help-panel" role="region" aria-labelledby="help-chapter-title">
          <div className="help-chapter-heading"><span>{activeChapter.eyebrow}</span><h2 id="help-chapter-title">{activeChapter.title}</h2><p>{activeChapter.subtitle}</p></div>
          <StrategicBackground ids={activeChapter.strategists} />
          <ChapterContent chapterId={activeId} />
          <div className="help-chapter-footer">
            <button type="button" disabled={activeId === chapters[0].id} onClick={() => selectChapter(chapters[Math.max(0, chapters.findIndex((chapter) => chapter.id === activeId) - 1)].id)}>← {pick(language, 'Zurück', 'Previous')}</button>
            <span>{chapters.findIndex((chapter) => chapter.id === activeId) + 1} / {chapters.length}</span>
            {activeId === chapters.at(-1)!.id
              ? <button type="button" onClick={onClose}>{pick(language, 'Anleitung schließen', 'Close guide')} ✓</button>
              : <button type="button" onClick={() => selectChapter(chapters[Math.min(chapters.length - 1, chapters.findIndex((chapter) => chapter.id === activeId) + 1)].id)}>{pick(language, 'Weiter', 'Next')} →</button>}
          </div>
        </div>
      </div>
    </section>
  </div>
}

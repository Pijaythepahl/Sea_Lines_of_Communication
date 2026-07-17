import type {
  CardDefinition,
  CardId,
  FactionId,
  RegionDefinition,
  RegionId,
  ResourceLevels,
  RouteDefinition,
  RouteId,
} from './types'

export const FACTIONS: Record<FactionId, { name: string; adjective: string; symbol: string }> = {
  blue: { name: 'Blaue Koalition', adjective: 'Blau', symbol: 'N' },
  red: { name: 'Rote Koalition', adjective: 'Rot', symbol: 'R' },
}

export const RESOURCE_LABELS: Record<keyof ResourceLevels, { name: string; short: string; max: number }> = {
  presence: { name: 'Präsenz', short: 'P', max: 3 },
  awareness: { name: 'Lagebild', short: 'L', max: 3 },
  access: { name: 'Zugang', short: 'Z', max: 2 },
  logistics: { name: 'Logistik', short: 'G', max: 2 },
}

export const USABILITY_LABELS = {
  free: { label: 'Frei nutzbar', short: 'FREI' },
  contested: { label: 'Umkämpft', short: 'DRUCK' },
  denied: { label: 'Verwehrt', short: 'ZU' },
} as const

export const REGION_ORDER: RegionId[] = [
  'western_sea',
  'northwest_passage',
  'central_basin',
  'meridian_strait',
  'freeport_sea',
  'northeast_passage',
  'eastern_sea',
  'southwest_arc',
  'southeast_arc',
]

export const REGIONS: Record<RegionId, RegionDefinition> = {
  western_sea: {
    id: 'western_sea', name: 'Westliches Randmeer', shortName: 'Randmeer West', subtitle: 'Ausgangsraum Blau',
    x: 102, y: 248, coastal: true, neighbors: ['northwest_passage', 'southwest_arc'],
    mapPath: 'M20 112 C77 75 154 92 185 151 L175 310 C123 340 65 321 24 285 Z',
  },
  eastern_sea: {
    id: 'eastern_sea', name: 'Östliches Randmeer', shortName: 'Randmeer Ost', subtitle: 'Ausgangsraum Rot',
    x: 798, y: 248, coastal: true, neighbors: ['northeast_passage', 'southeast_arc'],
    mapPath: 'M715 150 C754 91 831 78 881 115 L876 288 C831 325 772 336 724 307 Z',
  },
  northwest_passage: {
    id: 'northwest_passage', name: 'Nordwestliche Passage', shortName: 'NW-Passage', subtitle: 'Nördlicher Zugang',
    x: 264, y: 120, coastal: true, neighbors: ['western_sea', 'central_basin'],
    mapPath: 'M173 48 C246 15 339 43 360 111 L333 184 L181 160 Z',
  },
  northeast_passage: {
    id: 'northeast_passage', name: 'Nordöstliche Passage', shortName: 'NO-Passage', subtitle: 'Nördlicher Zugang',
    x: 638, y: 120, coastal: true, neighbors: ['eastern_sea', 'central_basin'],
    mapPath: 'M540 108 C571 41 664 18 728 50 L720 162 L567 185 Z',
  },
  central_basin: {
    id: 'central_basin', name: 'Zentrales Becken', shortName: 'Zentralbecken', subtitle: 'Operatives Scharnier',
    x: 414, y: 238, coastal: false, neighbors: ['northwest_passage', 'northeast_passage', 'meridian_strait'],
    mapPath: 'M330 164 L442 135 L526 184 L513 306 L404 333 L321 271 Z',
  },
  meridian_strait: {
    id: 'meridian_strait', name: 'Meridianstraße', shortName: 'Meridianstraße', subtitle: 'Strategischer Engpass',
    x: 552, y: 305, coastal: true, chokepoint: true, neighbors: ['central_basin', 'freeport_sea'],
    mapPath: 'M503 242 C544 213 598 239 616 279 L599 361 L518 360 L493 310 Z',
  },
  southwest_arc: {
    id: 'southwest_arc', name: 'Südwestlicher Bogen', shortName: 'SW-Bogen', subtitle: 'Kostenintensive Umfahrung',
    x: 250, y: 408, coastal: false, neighbors: ['western_sea', 'freeport_sea'],
    mapPath: 'M104 334 C174 295 296 315 365 399 L336 500 L164 498 L91 425 Z',
  },
  southeast_arc: {
    id: 'southeast_arc', name: 'Südöstlicher Bogen', shortName: 'SO-Bogen', subtitle: 'Kostenintensive Umfahrung',
    x: 670, y: 408, coastal: false, neighbors: ['eastern_sea', 'freeport_sea'],
    mapPath: 'M604 394 C672 315 786 299 842 349 L824 465 L735 507 L604 480 Z',
  },
  freeport_sea: {
    id: 'freeport_sea', name: 'Freihafen-See', shortName: 'Freihafen', subtitle: 'Neutraler Wirtschaftsraum',
    x: 452, y: 448, coastal: true, market: true, neighbors: ['meridian_strait', 'southwest_arc', 'southeast_arc'],
    mapPath: 'M338 352 L467 331 L610 361 L601 491 L483 518 L337 491 Z',
  },
}

export const ROUTE_ORDER: RouteId[] = ['blue_main', 'blue_detour', 'red_main', 'red_detour']

export const ROUTES: Record<RouteId, RouteDefinition> = {
  blue_main: {
    id: 'blue_main', faction: 'blue', name: 'Blaue Haupt-SLOC', kind: 'main', baseYield: 6,
    regions: ['western_sea', 'northwest_passage', 'central_basin', 'meridian_strait', 'freeport_sea'],
    svgPath: 'M102 248 C140 184 203 124 264 120 C326 116 370 183 414 238 C463 251 515 274 552 305 C540 365 508 421 452 448',
  },
  blue_detour: {
    id: 'blue_detour', faction: 'blue', name: 'Blaue Ausweich-SLOC', kind: 'detour', baseYield: 3,
    regions: ['western_sea', 'southwest_arc', 'freeport_sea'],
    svgPath: 'M102 248 C38 332 59 449 151 482 C195 498 232 459 250 408 C302 484 391 514 452 448',
  },
  red_main: {
    id: 'red_main', faction: 'red', name: 'Rote Haupt-SLOC', kind: 'main', baseYield: 6,
    regions: ['eastern_sea', 'northeast_passage', 'central_basin', 'meridian_strait', 'freeport_sea'],
    svgPath: 'M798 248 C760 184 699 124 638 120 C574 116 478 184 414 238 C463 251 515 274 552 305 C540 365 508 421 452 448',
  },
  red_detour: {
    id: 'red_detour', faction: 'red', name: 'Rote Ausweich-SLOC', kind: 'detour', baseYield: 3,
    regions: ['eastern_sea', 'southeast_arc', 'freeport_sea'],
    svgPath: 'M798 248 C862 332 841 449 749 482 C705 498 682 459 670 408 C602 484 513 514 452 448',
  },
}

export const CARD_ORDER: CardId[] = [
  'patrol_group',
  'forward_deployment',
  'isr_recon',
  'persistent_sensors',
  'port_agreement',
  'forward_base',
  'convoy_escort',
  'shadowing_operation',
  'hybrid_pressure',
  'deescalation_channel',
  'detour_expansion',
]

export const CARDS: Record<CardId, CardDefinition> = {
  patrol_group: {
    id: 'patrol_group', title: 'Patrouillenverband', domain: 'Präsenz', icon: '⚓', cost: 1, target: 'region-pair',
    description: 'Verlege 1 Präsenz ein oder zwei Regionen weit.', instruction: 'Wähle zuerst den Ausgangsraum, dann ein Ziel in bis zu zwei Feldern Entfernung.',
    playHint: 'Verlegt 1 Präsenz für 1 AP. Bei zwei Feldern muss ein nicht verwehrter Zwischenraum existieren; dieser wird automatisch ermittelt.',
    escalation: 0,
  },
  forward_deployment: {
    id: 'forward_deployment', title: 'Vorausstationierung', domain: 'Präsenz', icon: '▲', cost: 2, target: 'region',
    description: '+1 Präsenz und bis zu +1 Lagebild im Heimatmeer oder an einem versorgten Vorposten.', instruction: 'Wähle das Heimatmeer oder einen über eine eigene SLOC versorgten Vorposten.',
    playHint: 'Vorposten benötigen aktiven Zugang, aktive Logistik und eine nicht verwehrte Verbindung zum Heimatmeer. Präsenz verbessert das Lagebild bis maximal 2.',
    escalation: 1, escalationReason: 'Sichtbare Verstärkung vorgeschobener Kräfte',
  },
  isr_recon: {
    id: 'isr_recon', title: 'ISR-Aufklärung', domain: 'Lagebild', icon: '◉', cost: 1, target: 'region',
    description: '+1 Lagebild in einer beliebigen Region.', instruction: 'Wähle eine Region mit freier Lagebild-Kapazität.',
    playHint: 'In jeder beliebigen Region spielbar, solange dein Lagebild dort noch nicht den Höchstwert 3 erreicht hat.',
    escalation: 0,
  },
  persistent_sensors: {
    id: 'persistent_sensors', title: 'Persistente Sensorik', domain: 'Lagebild', icon: '⌁', cost: 2, target: 'region-pair',
    description: '+1 Lagebild im Ziel und in einem angrenzenden Raum.', instruction: 'Wähle zwei benachbarte Regionen.',
    playHint: 'Wähle zwei direkt benachbarte Regionen. In beiden muss dein Lagebild unter dem Höchstwert 3 liegen.',
    escalation: 1, escalationReason: 'Dauerhafte Überwachung erhöht den wahrgenommenen Druck',
  },
  port_agreement: {
    id: 'port_agreement', title: 'Hafenabkommen', domain: 'Zugang', icon: '◆', cost: 1, target: 'region',
    description: '+1 Zugang in einer Küsten- oder Inselregion.', instruction: 'Wähle eine zugängliche Küstenregion.',
    playHint: 'Nur in einer Küsten-, Insel- oder Hafenregion spielbar, in der dein Zugang noch unter dem Höchstwert 2 liegt.',
    escalation: 0,
  },
  forward_base: {
    id: 'forward_base', title: 'Vorgeschobener Stützpunkt', domain: 'Logistik', icon: '▰', cost: 1, target: 'region',
    description: '+1 Logistik in einer Region mit eigenem Zugang.', instruction: 'Wähle eine Region mit aktivem eigenem Zugang.',
    playHint: 'Nur in einer Region mit mindestens 1 aktivem eigenen Zugang und weniger als 2 eigener Logistik spielbar.',
    escalation: 1, escalationReason: 'Neue militärische Infrastruktur verändert die regionale Balance',
  },
  convoy_escort: {
    id: 'convoy_escort', title: 'Konvoisicherung', domain: 'Handel', icon: '↝', cost: 1, target: 'route',
    description: 'Ignoriere bei der nächsten Wertung 1 Umkämpft-Malus.', instruction: 'Wähle eine eigene SLOC.',
    playHint: 'Auf einer deiner beiden SLOCs spielbar. Wirkt bei der nächsten Wirtschaftsauswertung und verfällt anschließend.',
    escalation: 0,
  },
  shadowing_operation: {
    id: 'shadowing_operation', title: 'Beschattungsoperation', domain: 'Grauzone', icon: '◎', cost: 1, target: 'region',
    description: 'Reduziere gegnerisches Lagebild um 1.', instruction: 'Wähle eine Region mit eigenem und gegnerischem Lagebild.',
    playHint: 'Nur dort spielbar, wo du selbst mindestens 1 aktives Lagebild besitzt und der Gegner ebenfalls mindestens 1 Lagebild hat.',
    escalation: 1, escalationReason: 'Enge Beschattung birgt Fehlkalkulations- und Zwischenfallrisiken',
  },
  hybrid_pressure: {
    id: 'hybrid_pressure', title: 'Hybrider Druck', domain: 'Einfluss', icon: '◇', cost: 2, target: 'hybrid-resource',
    description: 'Suspendiere 1 gegnerischen Zugang oder Logistik bis zur Wertung.', instruction: 'Wähle Region und gegnerische Ressource.',
    playHint: 'Wähle eine Region mit aktivem gegnerischem Zugang oder aktiver gegnerischer Logistik. Danach bestimmst du, welche Ressource bis zur nächsten Wertung aussetzt.',
    escalation: 2, escalationReason: 'Direkter hybrider Zwang gegen gegnerische Infrastruktur',
  },
  deescalation_channel: {
    id: 'deescalation_channel', title: 'Krisenkommunikation', domain: 'Deeskalation', icon: '↘', cost: 1, target: 'none',
    description: 'Senke die gemeinsame Eskalation um 1.', instruction: 'Diese Karte benötigt keine Zielregion.',
    playHint: 'Spielbar, sobald die Eskalation mindestens 1 beträgt. Die Karte wird direkt bestätigt und benötigt kein Ziel auf der Karte.',
    escalation: 0,
  },
  detour_expansion: {
    id: 'detour_expansion', title: 'Zusätzliche Tonnage', domain: 'Handel', icon: '≋', cost: 1, target: 'none',
    description: 'Erhöhe die Kapazität deiner Ausweich-SLOC dauerhaft um 1.', instruction: 'Diese Karte benötigt keine Zielauswahl.',
    playHint: 'Spielbar, solange deine Ausweich-SLOC noch nicht Kapazität 5 erreicht hat. Jede Koalition besitzt genau zwei Exemplare.',
    escalation: 0,
  },
}

export const EMPTY_RESOURCES = (): ResourceLevels => ({ presence: 0, awareness: 0, access: 0, logistics: 0 })

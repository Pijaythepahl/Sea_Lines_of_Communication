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
    x: 200, y: 145, coastal: true, neighbors: ['northwest_passage', 'southwest_arc'],
    mapPath: 'M0 92 C63 75 145 91 205 139 L214 283 C159 333 70 344 0 306 Z',
  },
  eastern_sea: {
    id: 'eastern_sea', name: 'Östliches Randmeer', shortName: 'Randmeer Ost', subtitle: 'Ausgangsraum Rot',
    x: 700, y: 145, coastal: true, neighbors: ['northeast_passage', 'southeast_arc'],
    mapPath: 'M900 92 C837 75 755 91 695 139 L686 283 C741 333 830 344 900 306 Z',
  },
  northwest_passage: {
    id: 'northwest_passage', name: 'Nordwestliche Passage', shortName: 'NW-Passage', subtitle: 'Nördlicher Zugang',
    x: 300, y: 70, coastal: true, neighbors: ['western_sea', 'central_basin'],
    mapPath: 'M155 0 C241 0 352 12 410 42 L409 126 C324 145 233 135 171 106 Z',
  },
  northeast_passage: {
    id: 'northeast_passage', name: 'Nordöstliche Passage', shortName: 'NO-Passage', subtitle: 'Nördlicher Zugang',
    x: 600, y: 70, coastal: true, neighbors: ['eastern_sea', 'central_basin'],
    mapPath: 'M745 0 C659 0 548 12 490 42 L491 126 C576 145 667 135 729 106 Z',
  },
  central_basin: {
    id: 'central_basin', name: 'Zentrales Becken', shortName: 'Zentralbecken', subtitle: 'Operatives Scharnier',
    x: 450, y: 70, coastal: false, neighbors: ['northwest_passage', 'northeast_passage', 'meridian_strait'],
    mapPath: 'M398 0 L502 0 L526 84 L498 137 L402 137 L374 84 Z',
  },
  meridian_strait: {
    id: 'meridian_strait', name: 'Meridianstraße', shortName: 'Meridianstraße', subtitle: 'Strategischer Engpass',
    x: 450, y: 220, coastal: true, chokepoint: true, neighbors: ['central_basin', 'freeport_sea'],
    mapPath: 'M394 121 C426 105 474 105 506 121 L523 243 C500 277 400 277 377 243 Z',
  },
  southwest_arc: {
    id: 'southwest_arc', name: 'Südwestlicher Bogen', shortName: 'SW-Bogen', subtitle: 'Kostenintensive Umfahrung',
    x: 375, y: 448, coastal: false, neighbors: ['western_sea', 'freeport_sea'],
    mapPath: 'M0 286 C93 309 185 344 258 390 C316 426 366 447 422 470 L402 530 L0 530 Z',
  },
  southeast_arc: {
    id: 'southeast_arc', name: 'Südöstlicher Bogen', shortName: 'SO-Bogen', subtitle: 'Kostenintensive Umfahrung',
    x: 525, y: 448, coastal: false, neighbors: ['eastern_sea', 'freeport_sea'],
    mapPath: 'M900 286 C807 309 715 344 642 390 C584 426 534 447 478 470 L498 530 L900 530 Z',
  },
  freeport_sea: {
    id: 'freeport_sea', name: 'Freihafen-See', shortName: 'Freihafen', subtitle: 'Neutraler Wirtschaftsraum',
    x: 450, y: 325, coastal: true, market: true, neighbors: ['meridian_strait', 'southwest_arc', 'southeast_arc'],
    mapPath: 'M347 245 C392 225 508 225 553 245 L578 389 C540 430 360 430 322 389 Z',
  },
}

export const ROUTE_ORDER: RouteId[] = ['blue_main', 'blue_detour', 'red_main', 'red_detour']

export const ROUTES: Record<RouteId, RouteDefinition> = {
  blue_main: {
    id: 'blue_main', faction: 'blue', name: 'Blaue Haupt-SLOC', kind: 'main', baseYield: 6,
    regions: ['western_sea', 'northwest_passage', 'central_basin', 'meridian_strait', 'freeport_sea'],
    svgPath: 'M200 145 C222 104 258 78 300 70 C350 70 402 70 444 70 L444 220 C414 239 379 263 382 286 C386 304 416 320 444 325',
    statusPosition: { x: 365, y: 99 },
  },
  blue_detour: {
    id: 'blue_detour', faction: 'blue', name: 'Blaue Ausweich-SLOC', kind: 'detour', baseYield: 3,
    regions: ['western_sea', 'southwest_arc', 'freeport_sea'],
    svgPath: 'M200 145 C94 202 62 330 115 413 C176 487 302 489 375 448 C415 425 426 363 444 325',
    statusPosition: { x: 270, y: 395 },
  },
  red_main: {
    id: 'red_main', faction: 'red', name: 'Rote Haupt-SLOC', kind: 'main', baseYield: 6,
    regions: ['eastern_sea', 'northeast_passage', 'central_basin', 'meridian_strait', 'freeport_sea'],
    svgPath: 'M700 145 C678 104 642 78 600 70 C550 70 498 70 456 70 L456 220 C486 239 521 263 518 286 C514 304 484 320 456 325',
    statusPosition: { x: 535, y: 99 },
  },
  red_detour: {
    id: 'red_detour', faction: 'red', name: 'Rote Ausweich-SLOC', kind: 'detour', baseYield: 3,
    regions: ['eastern_sea', 'southeast_arc', 'freeport_sea'],
    svgPath: 'M700 145 C806 202 838 330 785 413 C724 487 598 489 525 448 C485 425 474 363 456 325',
    statusPosition: { x: 630, y: 395 },
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
    description: 'Verlege 1 Präsenz ein oder zwei Regionen weit. Am Ziel gilt bis zur nächsten Wertung mindestens Lagebild 1.', instruction: 'Wähle zuerst den Ausgangsraum, dann ein Ziel in bis zu zwei Feldern Entfernung.',
    playHint: 'Verlegt 1 Präsenz für 1 AP und erzeugt am Ziel ein nicht stapelbares temporäres Lagebild. Bei zwei Feldern muss ein nicht verwehrter Zwischenraum existieren.',
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

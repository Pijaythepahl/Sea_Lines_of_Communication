import { createContext, useContext, type ReactNode } from 'react'
import { CARDS, FACTIONS, REGIONS, RESOURCE_LABELS, ROUTES, USABILITY_LABELS } from './data'
import type { CardDefinition, CardId, FactionId, GovernmentSelection, GovernmentType, LogEntry, RegionDefinition, RegionId, ResourceKey, RouteDefinition, RouteId, Usability, WinnerResult, YieldResult } from './types'

export type Language = 'de' | 'en'

const Context = createContext<Language>('de')

export const LanguageProvider = ({ language, children }: { language: Language; children: ReactNode }) => (
  <Context.Provider value={language}>{children}</Context.Provider>
)

export const useLanguage = () => useContext(Context)
export const pick = (language: Language, german: string, english: string) => language === 'de' ? german : english

const EN_FACTIONS: Record<FactionId, { name: string; adjective: string; symbol: string }> = {
  blue: { name: 'Blue Coalition', adjective: 'Blue', symbol: 'N' },
  red: { name: 'Red Coalition', adjective: 'Red', symbol: 'R' },
}

const EN_RESOURCES: Record<ResourceKey, { name: string; short: string; max: number }> = {
  presence: { name: 'Presence', short: 'P', max: 3 },
  awareness: { name: 'Awareness', short: 'A', max: 3 },
  access: { name: 'Access', short: 'X', max: 2 },
  logistics: { name: 'Logistics', short: 'L', max: 2 },
}

const EN_USABILITY: Record<Usability, { label: string; short: string }> = {
  free: { label: 'Open', short: 'OPEN' },
  contested: { label: 'Contested', short: 'PRESS' },
  denied: { label: 'Denied', short: 'CLOSED' },
}

const EN_REGIONS: Record<RegionId, Pick<RegionDefinition, 'name' | 'shortName' | 'subtitle'>> = {
  western_sea: { name: 'Western Littoral Sea', shortName: 'Western Sea', subtitle: 'Blue starting area' },
  eastern_sea: { name: 'Eastern Littoral Sea', shortName: 'Eastern Sea', subtitle: 'Red starting area' },
  northwest_passage: { name: 'Northwestern Passage', shortName: 'NW Passage', subtitle: 'Northern access route' },
  northeast_passage: { name: 'Northeastern Passage', shortName: 'NE Passage', subtitle: 'Northern access route' },
  central_basin: { name: 'Central Basin', shortName: 'Central Basin', subtitle: 'Operational hinge' },
  meridian_strait: { name: 'Meridian Strait', shortName: 'Meridian Strait', subtitle: 'Strategic chokepoint' },
  southwest_arc: { name: 'Southwestern Arc', shortName: 'SW Arc', subtitle: 'Costly detour' },
  southeast_arc: { name: 'Southeastern Arc', shortName: 'SE Arc', subtitle: 'Costly detour' },
  freeport_sea: { name: 'Freeport Sea', shortName: 'Freeport', subtitle: 'Neutral economic area' },
}

const EN_ROUTES: Record<RouteId, string> = {
  blue_main: 'Blue Main SLOC',
  blue_detour: 'Blue Detour SLOC',
  red_main: 'Red Main SLOC',
  red_detour: 'Red Detour SLOC',
}

const EN_CARDS: Record<CardId, Pick<CardDefinition, 'title' | 'domain' | 'description' | 'instruction' | 'playHint' | 'escalationReason'>> = {
  patrol_group: {
    title: 'Patrol Group', domain: 'Presence', description: 'Move 1 Presence one or two regions. The destination has at least 1 Awareness until the next evaluation.',
    instruction: 'Select the origin first, then a destination up to two regions away.',
    playHint: 'Moves 1 Presence for 1 AP and creates non-stacking temporary Awareness at the destination. A two-region move requires a non-denied intermediate region.',
  },
  forward_deployment: {
    title: 'Forward Deployment', domain: 'Presence', description: '+1 Presence and up to +1 Awareness at home or at a supplied outpost.',
    instruction: 'Select the home sea or an outpost supplied through a friendly SLOC.',
    playHint: 'Outposts require active Access, active Logistics, and a non-denied connection to the home sea. Presence improves Awareness up to 2.',
    escalationReason: 'A visible reinforcement of forward forces',
  },
  isr_recon: {
    title: 'ISR Reconnaissance', domain: 'Awareness', description: '+1 Awareness in any region.',
    instruction: 'Select a region with available Awareness capacity.',
    playHint: 'Playable in any region where your Awareness has not yet reached its maximum of 3.',
  },
  persistent_sensors: {
    title: 'Persistent Sensors', domain: 'Awareness', description: '+1 Awareness in the target and an adjacent region.',
    instruction: 'Select two adjacent regions.',
    playHint: 'Select two directly adjacent regions. Your Awareness must be below 3 in both.',
    escalationReason: 'Persistent surveillance increases perceived pressure',
  },
  port_agreement: {
    title: 'Port Agreement', domain: 'Access', description: '+1 Access in a coastal or island region.',
    instruction: 'Select an eligible coastal region.',
    playHint: 'Only playable in a coastal, island, or port region where your Access is below 2.',
  },
  forward_base: {
    title: 'Forward Base', domain: 'Logistics', description: '+1 Logistics in a region with friendly Access.',
    instruction: 'Select a region with active friendly Access.',
    playHint: 'Only playable in a region with at least 1 active friendly Access and fewer than 2 friendly Logistics.',
    escalationReason: 'New military infrastructure changes the regional balance',
  },
  convoy_escort: {
    title: 'Convoy Escort', domain: 'Trade', description: 'Ignore 1 contested penalty during the next evaluation.',
    instruction: 'Select one of your SLOCs.',
    playHint: 'Playable on either of your SLOCs. It applies to the next economic evaluation and then expires.',
  },
  shadowing_operation: {
    title: 'Shadowing Operation', domain: 'Grey Zone', description: 'Reduce opposing Awareness by 1.',
    instruction: 'Select a region with friendly and opposing Awareness.',
    playHint: 'Only playable where you have at least 1 active Awareness and your opponent also has at least 1 Awareness.',
    escalationReason: 'Close shadowing creates risks of incidents and miscalculation',
  },
  hybrid_pressure: {
    title: 'Hybrid Pressure', domain: 'Influence', description: 'Suspend 1 opposing Access or Logistics until the evaluation.',
    instruction: 'Select a region and an opposing resource.',
    playHint: 'Select a region with active opposing Access or Logistics, then choose which resource is suspended until the next evaluation.',
    escalationReason: 'Direct hybrid coercion against opposing infrastructure',
  },
  deescalation_channel: {
    title: 'Crisis Communications', domain: 'De-escalation', description: 'Reduce shared Escalation by 1.',
    instruction: 'This card does not require a target region.',
    playHint: 'Playable once Escalation is at least 1. The card is confirmed immediately and requires no map target.',
  },
  detour_expansion: {
    title: 'Additional Tonnage', domain: 'Trade', description: 'Permanently increase the capacity of your Detour SLOC by 1.',
    instruction: 'This card does not require a target.',
    playHint: 'Playable while your Detour SLOC is below capacity 5. Each coalition has exactly two copies.',
  },
}

export const factionText = (faction: FactionId, language: Language) => language === 'de' ? FACTIONS[faction] : EN_FACTIONS[faction]
export const resourceText = (resource: ResourceKey, language: Language) => language === 'de' ? RESOURCE_LABELS[resource] : EN_RESOURCES[resource]
export const usabilityText = (usability: Usability, language: Language) => language === 'de' ? USABILITY_LABELS[usability] : EN_USABILITY[usability]
export const regionText = (region: RegionId, language: Language): RegionDefinition => language === 'de' ? REGIONS[region] : { ...REGIONS[region], ...EN_REGIONS[region] }
export const routeText = (route: RouteId, language: Language): RouteDefinition => language === 'de' ? ROUTES[route] : { ...ROUTES[route], name: EN_ROUTES[route] }
export const cardText = (card: CardId, language: Language): CardDefinition => language === 'de' ? CARDS[card] : { ...CARDS[card], ...EN_CARDS[card] }

export const governmentText = (government: GovernmentType, language: Language) => government === 'democracy'
  ? {
      name: pick(language, 'Demokratie', 'Democracy'),
      benefit: pick(language, '+1 Ertrag bei Eskalation 0–2', '+1 Yield at Escalation 0–2'),
    }
  : {
      name: pick(language, 'Autokratie', 'Autocracy'),
      benefit: pick(language, '+1 Ertrag bei Eskalation 3–5', '+1 Yield at Escalation 3–5'),
    }

export const governmentPairingText = (governments: GovernmentSelection, language: Language) =>
  `${governmentText(governments.blue, language).name} ${pick(language, 'gegen', 'vs')} ${governmentText(governments.red, language).name}`

export const escalationLabel = (level: number, language: Language) => {
  if (level <= 1) return pick(language, 'Stabilität', 'Stability')
  if (level <= 3) return pick(language, 'Spannung', 'Tension')
  if (level <= 5) return pick(language, 'Krise', 'Crisis')
  if (level <= 7) return pick(language, 'Konfrontation', 'Confrontation')
  return pick(language, 'Kontrollverlust', 'Loss of Control')
}

export const leadershipLabel = (stars: number, language: Language) => [
  pick(language, 'Strategisch gescheitert', 'Strategic Failure'),
  pick(language, 'Riskante Bilanz', 'Risky Record'),
  pick(language, 'Kostspielige Führung', 'Costly Leadership'),
  pick(language, 'Kontrollierte Führung', 'Controlled Leadership'),
  pick(language, 'Vorbildliche Staatskunst', 'Exemplary Statecraft'),
][stars - 1]

const numberParam = (entry: LogEntry, key: string) => Number(entry.params?.[key] ?? 0)
const factionParam = (entry: LogEntry) => (entry.params?.faction === 'red' ? 'red' : 'blue') as FactionId

export const formatLogEntry = (entry: LogEntry, language: Language): string => {
  if (language === 'de' || !entry.code) return entry.message
  const faction = factionText(factionParam(entry), language).name
  const signed = (value: number) => value >= 0 ? `+${value}` : String(value)
  switch (entry.code) {
    case 'game-start': return 'Situation established. The Blue Coalition opens the first round.'
    case 'initiative': return `${faction} takes the initiative.`
    case 'round-start': return `Round ${numberParam(entry, 'round')} begins. ${faction} acts first.`
    case 'covert-prepared': return `${faction} has prepared a covert operation.`
    case 'covert-resolved': return `${faction}: A covert operation ${entry.params?.effective ? 'took effect' : 'had no observable effect'}.`
    case 'quiet-round': return 'A quiet round reduces shared Escalation by 1.'
    case 'evaluation': return `Economic evaluation: Blue ${signed(numberParam(entry, 'blue'))} · Red ${signed(numberParam(entry, 'red'))} · ${escalationLabel(numberParam(entry, 'escalation'), language)}`
    case 'game-complete': return `The ${numberParam(entry, 'rounds')}th economic evaluation ends the game.`
    case 'card-played': {
      const cardId = entry.params?.cardId as CardId
      const regionId = entry.params?.regionId as RegionId
      const routeId = entry.params?.routeId as RouteId
      const location = regionId && REGIONS[regionId] ? ` · ${regionText(regionId, language).shortName}` : routeId && ROUTES[routeId] ? ` · ${routeText(routeId, language).name}` : ''
      const escalation = numberParam(entry, 'escalation')
      const change = escalation > 0 ? ` · Escalation +${escalation}` : entry.params?.deescalated ? ' · Escalation −1' : ''
      return `${cardText(cardId, language).title}${location}${change}`
    }
    default: return entry.message
  }
}

export const formatWinnerReason = (winner: WinnerResult, language: Language): string => {
  if (language === 'de' || !winner.reasonCode) return winner.reason
  if (winner.reasonCode === 'draw') return 'Both coalitions keep their sea lines and strategic projection in balance.'
  const faction = factionText(winner.faction!, language).name
  if (winner.reasonCode === 'economy') return `${faction} achieves the higher total economic yield.`
  if (winner.reasonCode === 'final-yield') return `${faction} has the more capable sea line in the final round.`
  return `${faction} holds the stronger projection in the strategic core regions.`
}

export const formatYieldReason = (result: YieldResult, language: Language): string | undefined => {
  if (language === 'de' || !result.reason) return result.reason
  if (result.reason === 'Kein durchgehender Marktzugang') return 'No continuous market access'
  if (result.reason === 'Meridianstraße gegnerisch kontrolliert') return 'Meridian Strait controlled by opponent'
  if (result.reason === 'Kontrollverlust verursacht gesamtwirtschaftlichen Schaden') return 'Loss of control causes economy-wide damage'
  if (result.reason.endsWith(' ist verwehrt')) return 'A traversed region is denied'
  return result.reason
}

const ERROR_TRANSLATIONS: Record<string, string> = {
  'Die Partie ist bereits beendet.': 'The game has already ended.',
  'Nicht genügend Aktionspunkte.': 'Not enough action points.',
  'Die Zielauswahl ist unvollständig.': 'The target selection is incomplete.',
  'Dieses Ziel ist für die Karte nicht zulässig.': 'This target is not valid for the card.',
  'Die andere Koalition ist am Zug.': 'The other coalition is taking its turn.',
  'Die Online-Verbindung ist noch nicht bereit.': 'The online connection is not ready yet.',
  'Der Spielstand wurde inzwischen aktualisiert. Bitte erneut versuchen.': 'The game state has changed. Please try again.',
  'Die Ausweich-SLOC hat bereits ihre maximale Kapazität erreicht.': 'The Detour SLOC has already reached maximum capacity.',
  'Ungültige Rundenzahl.': 'Invalid round count.',
  'Ungültige Staatsform.': 'Invalid government.',
  'Der Spielraum konnte nicht erreicht werden.': 'The game room could not be reached.',
  'Dieser Spielraum existiert nicht.': 'This game room does not exist.',
  'In diesem Spielraum sind bereits zwei Personen.': 'This game room already has two players.',
  'Die Partie wartet noch auf die zweite Seite.': 'The game is waiting for the second player.',
  'Die Partie wartet auf eine neue Partie oder die zweite Seite.': 'The game is waiting for a rematch or the second player.',
  'Eine neue Partie kann erst mit zwei besetzten Seiten vorgeschlagen werden.': 'A new game can only be proposed once both seats are occupied.',
  'Die andere Koalition hat bereits eine neue Partie vorgeschlagen.': 'The other coalition has already proposed a new game.',
  'Es gibt keinen eigenen Vorschlag zum Zurückziehen.': 'There is no proposal of your own to withdraw.',
  'Es gibt keinen gegnerischen Vorschlag zum Ablehnen.': 'There is no opposing proposal to decline.',
  'Es gibt keinen gegnerischen Vorschlag zum Annehmen.': 'There is no opposing proposal to accept.',
  'Die Zugangsberechtigung für diesen Raum ist ungültig.': 'The access credentials for this room are invalid.',
  'Der empfangene Spielstand konnte nicht gelesen werden.': 'The received game state could not be read.',
  'Der Spielraum konnte nicht eröffnet werden.': 'The game room could not be opened.',
  'Der Beitritt ist fehlgeschlagen.': 'Joining the room failed.',
  'Die Aktion konnte nicht ausgeführt werden.': 'The action could not be completed.',
  'Die Ausweich-SLOC konnte nicht ausgebaut werden.': 'The Detour SLOC could not be upgraded.',
  'Der Zug konnte nicht beendet werden.': 'The turn could not be ended.',
}

export const formatError = (message: string, language: Language) => language === 'de' ? message : ERROR_TRANSLATIONS[message] ?? message

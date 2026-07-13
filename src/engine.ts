import { CARDS, CARD_ORDER, EMPTY_RESOURCES, FACTIONS, REGIONS, REGION_ORDER, RESOURCE_LABELS, ROUTES } from './data'
import type {
  CardId,
  CardInstance,
  CardPlay,
  FactionId,
  GameState,
  RegionId,
  ResourceLevels,
  RouteId,
  SuspendableResource,
  Usability,
  WinnerResult,
  YieldResult,
} from './types'

const MAX_ROUNDS = 6
const ACTION_POINTS = 3
const HAND_LIMIT = 7
const MAX_ESCALATION = 8

export const getEscalationBand = (level: number) => {
  if (level <= 1) return { label: 'Stabilität', penalty: 0, tone: 'stable' as const }
  if (level <= 3) return { label: 'Spannung', penalty: 1, tone: 'tension' as const }
  if (level <= 5) return { label: 'Krise', penalty: 2, tone: 'crisis' as const }
  if (level <= 7) return { label: 'Konfrontation', penalty: 3, tone: 'confrontation' as const }
  return { label: 'Kontrollverlust', penalty: 4, tone: 'breakdown' as const }
}

export const otherFaction = (faction: FactionId): FactionId => (faction === 'blue' ? 'red' : 'blue')

const shuffled = <T,>(items: T[]): T[] => {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

const createDeck = (faction: FactionId): CardInstance[] =>
  shuffled(CARD_ORDER.flatMap((cardId) => [0, 1].map((copy) => ({ instanceId: `${faction}-${cardId}-${copy}`, cardId }))))

const drawCards = (state: GameState, faction: FactionId, count = 1): void => {
  for (let index = 0; index < count; index += 1) {
    if (state.hands[faction].length >= HAND_LIMIT || state.decks[faction].length === 0) return
    const card = state.decks[faction].shift()
    if (card) state.hands[faction].push(card)
  }
}

const addLog = (state: GameState, message: string, faction?: FactionId): void => {
  state.log.unshift({ id: `${Date.now()}-${Math.random()}`, round: state.round, faction, message })
  state.log = state.log.slice(0, 16)
}

export const createInitialState = (): GameState => {
  const regions = Object.fromEntries(
    REGION_ORDER.map((id) => [id, { id, resources: { blue: EMPTY_RESOURCES(), red: EMPTY_RESOURCES() } }]),
  ) as GameState['regions']

  regions.western_sea.resources.blue = { presence: 2, awareness: 1, access: 2, logistics: 2 }
  regions.eastern_sea.resources.red = { presence: 2, awareness: 1, access: 2, logistics: 2 }
  regions.northwest_passage.resources.blue = { presence: 1, awareness: 1, access: 0, logistics: 1 }
  regions.northeast_passage.resources.red = { presence: 1, awareness: 1, access: 0, logistics: 1 }
  regions.freeport_sea.resources.blue.access = 1
  regions.freeport_sea.resources.red.access = 1

  const blueDeck = createDeck('blue')
  const redDeck = createDeck('red')
  const state: GameState = {
    version: 3,
    round: 1,
    phase: 'action',
    activeFaction: 'blue',
    turnIndex: 0,
    actionPoints: ACTION_POINTS,
    regions,
    decks: { blue: blueDeck, red: redDeck },
    hands: { blue: [], red: [] },
    discards: { blue: [], red: [] },
    economicScore: { blue: 0, red: 0 },
    escalation: 0,
    roundEscalation: { blue: 0, red: 0 },
    lastYield: {
      blue: { routeId: null, yield: 0, blocked: false, contestedRegions: 0, escalationPenalty: 0, responsibilityPenalty: 0 },
      red: { routeId: null, yield: 0, blocked: false, contestedRegions: 0, escalationPenalty: 0, responsibilityPenalty: 0 },
    },
    suspensions: [],
    protections: [],
    log: [],
  }
  drawCards(state, 'blue', 5)
  drawCards(state, 'red', 5)
  drawCards(state, 'blue', 1)
  addLog(state, 'Lage hergestellt. Die Blaue Koalition eröffnet die erste Runde.')
  return state
}

export const getEffectiveResources = (state: GameState, regionId: RegionId, faction: FactionId): ResourceLevels => {
  const base = state.regions[regionId].resources[faction]
  const result = { ...base }
  for (const suspension of state.suspensions) {
    if (suspension.faction === faction && suspension.regionId === regionId) {
      result[suspension.resource] = Math.max(0, result[suspension.resource] - suspension.amount)
    }
  }
  return result
}

export const calculateProjection = (state: GameState, regionId: RegionId, faction: FactionId): number => {
  const resources = getEffectiveResources(state, regionId, faction)
  return resources.presence + resources.awareness + resources.access + resources.logistics
}

export const getUsability = (state: GameState, regionId: RegionId, faction: FactionId): Usability => {
  const margin = calculateProjection(state, regionId, faction) - calculateProjection(state, regionId, otherFaction(faction))
  if (margin >= 0) return 'free'
  if (margin >= -2) return 'contested'
  return 'denied'
}

export const evaluateChokepoint = (state: GameState): FactionId | null => {
  const regionId: RegionId = 'meridian_strait'
  for (const faction of ['blue', 'red'] as const) {
    const own = getEffectiveResources(state, regionId, faction)
    const margin = calculateProjection(state, regionId, faction) - calculateProjection(state, regionId, otherFaction(faction))
    if (margin >= 2 && own.presence >= 2 && own.access >= 1) return faction
  }
  return null
}

export const calculateRouteYield = (state: GameState, routeId: RouteId): YieldResult => {
  const route = ROUTES[routeId]
  const faction = route.faction
  const opponent = otherFaction(faction)
  const escalationPenalty = getEscalationBand(state.escalation).penalty
  const responsibilityPenalty = state.roundEscalation[faction]
  const firstRegion = route.regions[0]
  const marketRegion = route.regions.at(-1)!
  if (getEffectiveResources(state, firstRegion, faction).access === 0 || getEffectiveResources(state, marketRegion, faction).access === 0) {
    return { routeId, yield: 0, blocked: true, contestedRegions: 0, escalationPenalty, responsibilityPenalty, reason: 'Kein durchgehender Marktzugang' }
  }
  if (route.kind === 'main' && evaluateChokepoint(state) === opponent) {
    return { routeId, yield: 0, blocked: true, contestedRegions: 0, escalationPenalty, responsibilityPenalty, reason: 'Meridianstraße gegnerisch kontrolliert' }
  }
  const denied = route.regions.find((regionId) => getUsability(state, regionId, faction) === 'denied')
  if (denied) {
    return { routeId, yield: 0, blocked: true, contestedRegions: 0, escalationPenalty, responsibilityPenalty, reason: `${REGIONS[denied].shortName} ist verwehrt` }
  }
  const contestedRegions = route.regions.filter((regionId) => getUsability(state, regionId, faction) === 'contested').length
  const protection = state.protections
    .filter((entry) => entry.faction === faction && entry.routeId === routeId)
    .reduce((sum, entry) => sum + entry.amount, 0)
  const effectivePenalty = Math.max(0, contestedRegions - protection)
  return {
    routeId,
    yield: Math.max(0, route.baseYield - effectivePenalty - escalationPenalty - responsibilityPenalty),
    blocked: false,
    contestedRegions,
    escalationPenalty,
    responsibilityPenalty,
  }
}

export const getBestYield = (state: GameState, faction: FactionId): YieldResult => {
  const routeIds = (Object.keys(ROUTES) as RouteId[]).filter((id) => ROUTES[id].faction === faction)
  const results = routeIds.map((id) => calculateRouteYield(state, id))
  return results.reduce((best, current) => (current.yield > best.yield ? current : best), results[0])
}

const hasRoom = (state: GameState, regionId: RegionId, faction: FactionId, resource: keyof ResourceLevels): boolean =>
  state.regions[regionId].resources[faction][resource] < RESOURCE_LABELS[resource].max

export const getValidRegionTargets = (state: GameState, cardId: CardId, selected: RegionId[] = []): RegionId[] => {
  const faction = state.activeFaction
  const opponent = otherFaction(faction)
  const all = REGION_ORDER
  switch (cardId) {
    case 'patrol_group':
      if (selected.length === 0) {
        return all.filter((id) => state.regions[id].resources[faction].presence > 0 && REGIONS[id].neighbors.some((neighbor) => hasRoom(state, neighbor, faction, 'presence')))
      }
      return REGIONS[selected[0]].neighbors.filter((id) => hasRoom(state, id, faction, 'presence'))
    case 'forward_deployment':
      return all.filter((id) => getEffectiveResources(state, id, faction).logistics > 0 && hasRoom(state, id, faction, 'presence'))
    case 'isr_recon':
      return all.filter((id) => hasRoom(state, id, faction, 'awareness'))
    case 'persistent_sensors':
      if (selected.length === 0) {
        return all.filter((id) => hasRoom(state, id, faction, 'awareness') && REGIONS[id].neighbors.some((neighbor) => hasRoom(state, neighbor, faction, 'awareness')))
      }
      return REGIONS[selected[0]].neighbors.filter((id) => hasRoom(state, id, faction, 'awareness'))
    case 'port_agreement':
      return all.filter((id) => REGIONS[id].coastal && hasRoom(state, id, faction, 'access'))
    case 'forward_base':
      return all.filter((id) => getEffectiveResources(state, id, faction).access > 0 && hasRoom(state, id, faction, 'logistics'))
    case 'shadowing_operation':
      return all.filter((id) => getEffectiveResources(state, id, faction).awareness > 0 && state.regions[id].resources[opponent].awareness > 0)
    case 'hybrid_pressure':
      return all.filter((id) => getEffectiveResources(state, id, opponent).access > 0 || getEffectiveResources(state, id, opponent).logistics > 0)
    default:
      return []
  }
}

export const getValidHybridResources = (state: GameState, regionId: RegionId): SuspendableResource[] => {
  const opponent = otherFaction(state.activeFaction)
  return (['access', 'logistics'] as const).filter((resource) => getEffectiveResources(state, regionId, opponent)[resource] > 0)
}

export const isPlayReady = (cardId: CardId, play: CardPlay): boolean => {
  const target = CARDS[cardId].target
  if (target === 'none') return true
  if (target === 'region') return play.regions?.length === 1
  if (target === 'region-pair') return play.regions?.length === 2
  if (target === 'route') return Boolean(play.routeId)
  return play.regions?.length === 1 && Boolean(play.resource)
}

const assertValidPlay = (state: GameState, cardId: CardId, play: CardPlay): void => {
  const card = CARDS[cardId]
  if (state.phase !== 'action') throw new Error('Die Partie ist bereits beendet.')
  if (card.cost > state.actionPoints) throw new Error('Nicht genügend Aktionspunkte.')
  if (!isPlayReady(cardId, play)) throw new Error('Die Zielauswahl ist unvollständig.')
  if (cardId === 'deescalation_channel' && state.escalation === 0) {
    throw new Error('Ohne Eskalation ist keine Krisenkommunikation erforderlich.')
  }
  if (card.target === 'none') return
  if (card.target === 'route') {
    if (!play.routeId || ROUTES[play.routeId].faction !== state.activeFaction) throw new Error('Ungültige SLOC.')
    return
  }
  const selected = play.regions ?? []
  for (let index = 0; index < selected.length; index += 1) {
    const valid = getValidRegionTargets(state, cardId, selected.slice(0, index))
    if (!valid.includes(selected[index])) throw new Error('Dieses Ziel ist für die Karte nicht zulässig.')
  }
  if (card.target === 'hybrid-resource' && (!play.resource || !getValidHybridResources(state, selected[0]).includes(play.resource))) {
    throw new Error('Die gewählte Ressource kann nicht suspendiert werden.')
  }
}

export const playCard = (state: GameState, play: CardPlay): GameState => {
  const next = structuredClone(state)
  const faction = next.activeFaction
  const opponent = otherFaction(faction)
  const cardIndex = next.hands[faction].findIndex((entry) => entry.instanceId === play.instanceId)
  if (cardIndex < 0) throw new Error('Die Karte befindet sich nicht auf der aktiven Hand.')
  const instance = next.hands[faction][cardIndex]
  const card = CARDS[instance.cardId]
  assertValidPlay(next, instance.cardId, play)
  const targets = play.regions ?? []

  switch (instance.cardId) {
    case 'patrol_group':
      next.regions[targets[0]].resources[faction].presence -= 1
      next.regions[targets[1]].resources[faction].presence += 1
      break
    case 'forward_deployment':
      next.regions[targets[0]].resources[faction].presence += 1
      break
    case 'isr_recon':
      next.regions[targets[0]].resources[faction].awareness += 1
      break
    case 'persistent_sensors':
      next.regions[targets[0]].resources[faction].awareness += 1
      next.regions[targets[1]].resources[faction].awareness += 1
      break
    case 'port_agreement':
      next.regions[targets[0]].resources[faction].access += 1
      break
    case 'forward_base':
      next.regions[targets[0]].resources[faction].logistics += 1
      break
    case 'convoy_escort':
      next.protections.push({
        id: `protection-${Date.now()}-${Math.random()}`,
        faction,
        routeId: play.routeId!,
        amount: 1,
        expiresAfterRound: next.round,
      })
      break
    case 'shadowing_operation':
      next.regions[targets[0]].resources[opponent].awareness -= 1
      break
    case 'hybrid_pressure':
      next.suspensions.push({
        id: `suspension-${Date.now()}-${Math.random()}`,
        faction: opponent,
        regionId: targets[0],
        resource: play.resource!,
        amount: 1,
        expiresAfterRound: next.round,
      })
      break
    case 'deescalation_channel':
      next.escalation = Math.max(0, next.escalation - 1)
      break
  }

  next.actionPoints -= card.cost
  if (card.escalation > 0) {
    next.escalation = Math.min(MAX_ESCALATION, next.escalation + card.escalation)
    next.roundEscalation[faction] += card.escalation
  }
  next.hands[faction].splice(cardIndex, 1)
  next.discards[faction].push(instance)
  const location = targets[0] ? ` · ${REGIONS[targets.at(-1)!].shortName}` : play.routeId ? ` · ${ROUTES[play.routeId].name}` : ''
  const escalationChange = card.escalation > 0 ? ` · Eskalation +${card.escalation}` : instance.cardId === 'deescalation_channel' ? ' · Eskalation −1' : ''
  addLog(next, `${card.title}${location}${escalationChange}`, faction)
  return next
}

const strategicProjection = (state: GameState, faction: FactionId): number =>
  (['central_basin', 'meridian_strait', 'freeport_sea'] as RegionId[]).reduce(
    (sum, regionId) => sum + calculateProjection(state, regionId, faction),
    0,
  )

export const determineWinner = (state: GameState): WinnerResult => {
  const blueScore = state.economicScore.blue
  const redScore = state.economicScore.red
  if (blueScore !== redScore) {
    const faction = blueScore > redScore ? 'blue' : 'red'
    return { faction, reason: `${FACTIONS[faction].name} erzielt den höheren wirtschaftlichen Gesamtertrag.` }
  }
  if (state.lastYield.blue.yield !== state.lastYield.red.yield) {
    const faction = state.lastYield.blue.yield > state.lastYield.red.yield ? 'blue' : 'red'
    return { faction, reason: `${FACTIONS[faction].name} verfügt in der Schlussrunde über die leistungsfähigere Seeverbindung.` }
  }
  const blueProjection = strategicProjection(state, 'blue')
  const redProjection = strategicProjection(state, 'red')
  if (blueProjection !== redProjection) {
    const faction = blueProjection > redProjection ? 'blue' : 'red'
    return { faction, reason: `${FACTIONS[faction].name} besitzt die stärkere Projektion in den strategischen Kernräumen.` }
  }
  return { faction: null, reason: 'Beide Koalitionen halten Seeverbindungen und Projektion im Gleichgewicht.' }
}

export const endTurn = (state: GameState): GameState => {
  if (state.phase !== 'action') return state
  const next = structuredClone(state)
  if (next.turnIndex === 0) {
    next.turnIndex = 1
    next.activeFaction = otherFaction(next.activeFaction)
    next.actionPoints = ACTION_POINTS
    drawCards(next, next.activeFaction)
    addLog(next, `${FACTIONS[next.activeFaction].name} übernimmt die Initiative.`)
    return next
  }

  const blueYield = getBestYield(next, 'blue')
  const redYield = getBestYield(next, 'red')
  next.lastYield = { blue: blueYield, red: redYield }
  next.economicScore.blue += blueYield.yield
  next.economicScore.red += redYield.yield
  addLog(next, `Wirtschaftsauswertung: Blau +${blueYield.yield} · Rot +${redYield.yield} · ${getEscalationBand(next.escalation).label}`)
  const roundRisk = next.roundEscalation.blue + next.roundEscalation.red
  if (roundRisk === 0 && next.escalation > 0) {
    next.escalation -= 1
    addLog(next, 'Eine ruhige Runde senkt die gemeinsame Eskalation um 1.')
  }
  next.suspensions = next.suspensions.filter((entry) => entry.expiresAfterRound > next.round)
  next.protections = next.protections.filter((entry) => entry.expiresAfterRound > next.round)

  if (next.round >= MAX_ROUNDS) {
    next.phase = 'complete'
    next.actionPoints = 0
    next.winner = determineWinner(next)
    addLog(next, 'Die sechste Wirtschaftsauswertung beendet die Partie.')
    return next
  }

  next.round += 1
  next.turnIndex = 0
  next.activeFaction = next.round % 2 === 1 ? 'blue' : 'red'
  next.actionPoints = ACTION_POINTS
  next.roundEscalation = { blue: 0, red: 0 }
  drawCards(next, next.activeFaction)
  addLog(next, `Runde ${next.round} beginnt. ${FACTIONS[next.activeFaction].name} handelt zuerst.`)
  return next
}

export const getCardDefinition = (instance: CardInstance) => CARDS[instance.cardId]

export const constants = { MAX_ROUNDS, ACTION_POINTS, HAND_LIMIT, MAX_ESCALATION }

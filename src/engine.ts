import { CARDS, CARD_ORDER, EMPTY_RESOURCES, FACTIONS, REGIONS, REGION_ORDER, RESOURCE_LABELS, ROUTES } from './data'
import type {
  CardId,
  CardInstance,
  CardPlay,
  CovertOperation,
  FactionId,
  GameState,
  GovernmentSelection,
  GovernmentType,
  LeadershipRating,
  RegionId,
  ResourceLevels,
  RoundCount,
  RouteId,
  SuspendableResource,
  Usability,
  WinnerResult,
  YieldResult,
} from './types'

const DEFAULT_ROUNDS: RoundCount = 6
const ROUND_OPTIONS: RoundCount[] = [6, 12, 18]
const DEFAULT_GOVERNMENTS: GovernmentSelection = { blue: 'democracy', red: 'democracy' }
const GOVERNMENT_OPTIONS: GovernmentType[] = ['democracy', 'autocracy']
const ACTION_POINTS = 3
const HAND_LIMIT = 7
const MAX_ESCALATION = 8
const MAX_DETOUR_CAPACITY = 5

export const COVERT_CARD_IDS: CardId[] = ['shadowing_operation', 'hybrid_pressure']

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

const createDeck = (faction: FactionId, maxRounds: RoundCount): CardInstance[] => {
  const regularCards = CARD_ORDER.filter((cardId) => cardId !== 'detour_expansion')
  const copies = maxRounds === 6 ? 2 : maxRounds === 12 ? 3 : 4
  const cards: CardInstance[] = regularCards.flatMap((cardId) =>
    Array.from({ length: copies + (cardId === 'patrol_group' ? 2 : 0) }, (_, copy) => ({ instanceId: `${faction}-${cardId}-${copy}`, cardId })),
  )
  cards.push(
    { instanceId: `${faction}-detour_expansion-0`, cardId: 'detour_expansion' },
    { instanceId: `${faction}-detour_expansion-1`, cardId: 'detour_expansion' },
  )
  return shuffled(cards)
}

const cardsPerTurn = (maxRounds: RoundCount): number => maxRounds === 6 ? 1 : 2

const drawCards = (state: GameState, faction: FactionId, count = 1): void => {
  for (let index = 0; index < count; index += 1) {
    if (state.hands[faction].length >= HAND_LIMIT || state.decks[faction].length === 0) return
    const card = state.decks[faction].shift()
    if (card) state.hands[faction].push(card)
  }
}

const addLog = (state: GameState, message: string, faction?: FactionId, code?: string, params?: Record<string, string | number | boolean>): void => {
  state.log.unshift({ id: `${Date.now()}-${Math.random()}`, round: state.round, faction, message, code, params })
}

export const createInitialState = (maxRounds: RoundCount = DEFAULT_ROUNDS, governments: GovernmentSelection = DEFAULT_GOVERNMENTS): GameState => {
  if (!ROUND_OPTIONS.includes(maxRounds)) throw new Error('Ungültige Rundenzahl.')
  if (!GOVERNMENT_OPTIONS.includes(governments.blue) || !GOVERNMENT_OPTIONS.includes(governments.red)) throw new Error('Ungültige Staatsform.')
  const regions = Object.fromEntries(
    REGION_ORDER.map((id) => [id, { id, resources: { blue: EMPTY_RESOURCES(), red: EMPTY_RESOURCES() } }]),
  ) as GameState['regions']

  regions.western_sea.resources.blue = { presence: 2, awareness: 1, access: 2, logistics: 2 }
  regions.eastern_sea.resources.red = { presence: 2, awareness: 1, access: 2, logistics: 2 }
  regions.northwest_passage.resources.blue = { presence: 1, awareness: 1, access: 0, logistics: 1 }
  regions.northeast_passage.resources.red = { presence: 1, awareness: 1, access: 0, logistics: 1 }
  regions.freeport_sea.resources.blue.access = 1
  regions.freeport_sea.resources.red.access = 1

  const blueDeck = createDeck('blue', maxRounds)
  const redDeck = createDeck('red', maxRounds)
  const state: GameState = {
    version: 9,
    maxRounds,
    governments: { ...governments },
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
    routeCapacity: { blue_main: 6, blue_detour: 3, red_main: 6, red_detour: 3 },
    escalation: 0,
    roundEscalation: { blue: 0, red: 0 },
    totalEscalation: { blue: 0, red: 0 },
    escalationActions: { blue: 0, red: 0 },
    deescalationActions: { blue: 0, red: 0 },
    escalationHistory: [],
    leadershipHistoryComplete: true,
    endedActionPoints: { blue: 0, red: 0 },
    lastEvaluationEscalation: 0,
    lastYield: {
      blue: { routeId: null, yield: 0, blocked: false, contestedRegions: 0, escalationPenalty: 0, responsibilityPenalty: 0, governmentBonus: 0, restraintBonus: 0, controlLossPenalty: 0 },
      red: { routeId: null, yield: 0, blocked: false, contestedRegions: 0, escalationPenalty: 0, responsibilityPenalty: 0, governmentBonus: 0, restraintBonus: 0, controlLossPenalty: 0 },
    },
    patrolAwareness: [],
    suspensions: [],
    protections: [],
    covertOperations: [],
    log: [],
  }
  drawCards(state, 'blue', 5)
  drawCards(state, 'red', 5)
  drawCards(state, 'blue', cardsPerTurn(maxRounds))
  addLog(state, 'Lage hergestellt. Die Blaue Koalition eröffnet die erste Runde.', undefined, 'game-start')
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
  if (state.patrolAwareness.some((entry) => entry.faction === faction && entry.regionId === regionId)) {
    result.awareness = Math.max(1, result.awareness)
  }
  return result
}

export const hasPatrolAwareness = (state: GameState, regionId: RegionId, faction: FactionId): boolean =>
  state.patrolAwareness.some((entry) => entry.faction === faction && entry.regionId === regionId)

const reduceAwareness = (state: GameState, regionId: RegionId, faction: FactionId): boolean => {
  const before = getEffectiveResources(state, regionId, faction).awareness
  if (before === 0) return false
  const resources = state.regions[regionId].resources[faction]
  if (resources.awareness > 0) resources.awareness -= 1
  if (getEffectiveResources(state, regionId, faction).awareness >= before) {
    state.patrolAwareness = state.patrolAwareness.filter((entry) => entry.faction !== faction || entry.regionId !== regionId)
  }
  return true
}

export const calculateProjection = (state: GameState, regionId: RegionId, faction: FactionId): number => {
  const resources = getEffectiveResources(state, regionId, faction)
  return resources.presence + resources.awareness + resources.access + resources.logistics
}

export const getUsability = (state: GameState, regionId: RegionId, faction: FactionId): Usability => {
  const margin = calculateProjection(state, regionId, faction) - calculateProjection(state, regionId, otherFaction(faction))
  if (margin >= 0) return 'free'
  if (margin >= -2 || regionId === 'freeport_sea') return 'contested'
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
  const government = state.governments[faction]
  const governmentBonus = government === 'democracy'
    ? (state.escalation <= 2 ? 1 : 0)
    : (state.escalation >= 3 && state.escalation <= 5 ? 1 : 0)
  const firstRegion = route.regions[0]
  const marketRegion = route.regions.at(-1)!
  if (getEffectiveResources(state, firstRegion, faction).access === 0 || getEffectiveResources(state, marketRegion, faction).access === 0) {
    return { routeId, yield: 0, blocked: true, contestedRegions: 0, escalationPenalty, responsibilityPenalty, governmentBonus: 0, restraintBonus: 0, controlLossPenalty: 0, reason: 'Kein durchgehender Marktzugang' }
  }
  if (route.kind === 'main' && evaluateChokepoint(state) === opponent) {
    return { routeId, yield: 0, blocked: true, contestedRegions: 0, escalationPenalty, responsibilityPenalty, governmentBonus: 0, restraintBonus: 0, controlLossPenalty: 0, reason: 'Meridianstraße gegnerisch kontrolliert' }
  }
  const denied = route.regions.find((regionId) => getUsability(state, regionId, faction) === 'denied')
  if (denied) {
    return { routeId, yield: 0, blocked: true, contestedRegions: 0, escalationPenalty, responsibilityPenalty, governmentBonus: 0, restraintBonus: 0, controlLossPenalty: 0, reason: `${REGIONS[denied].shortName} ist verwehrt` }
  }
  const contestedRegions = route.regions.filter((regionId) => getUsability(state, regionId, faction) === 'contested').length
  const protection = state.protections
    .filter((entry) => entry.faction === faction && entry.routeId === routeId)
    .reduce((sum, entry) => sum + entry.amount, 0)
  const effectivePenalty = Math.max(0, contestedRegions - protection)
  return {
    routeId,
    yield: Math.max(0, state.routeCapacity[routeId] - effectivePenalty - escalationPenalty - responsibilityPenalty) + governmentBonus,
    blocked: false,
    contestedRegions,
    escalationPenalty,
    responsibilityPenalty,
    governmentBonus,
    restraintBonus: 0,
    controlLossPenalty: 0,
  }
}

export const getBestYield = (state: GameState, faction: FactionId): YieldResult => {
  const routeIds = (Object.keys(ROUTES) as RouteId[]).filter((id) => ROUTES[id].faction === faction)
  const results = routeIds.map((id) => calculateRouteYield(state, id))
  return results.reduce((best, current) => (current.yield > best.yield ? current : best), results[0])
}

export const calculateRoundYield = (
  state: GameState,
  faction: FactionId,
  options: { actionPoints?: number; covertUsed?: boolean } = {},
): YieldResult => {
  const best = getBestYield(state, faction)
  if (state.escalation >= MAX_ESCALATION) {
    const controlLossPenalty = state.roundEscalation[faction] > 0 ? 2 : 1
    return {
      ...best,
      yield: -controlLossPenalty,
      restraintBonus: 0,
      controlLossPenalty,
      reason: 'Kontrollverlust verursacht gesamtwirtschaftlichen Schaden',
    }
  }
  const actionPoints = options.actionPoints ?? state.endedActionPoints[faction]
  const covertUsed = options.covertUsed ?? state.covertOperations.some((entry) => entry.faction === faction)
  const restraintBonus = actionPoints >= 1 && state.roundEscalation[faction] === 0 && !covertUsed ? 1 : 0
  return { ...best, yield: best.yield + restraintBonus, restraintBonus }
}

const hasRoom = (state: GameState, regionId: RegionId, faction: FactionId, resource: keyof ResourceLevels): boolean =>
  state.regions[regionId].resources[faction][resource] < RESOURCE_LABELS[resource].max

const HOME_REGIONS: Record<FactionId, RegionId> = { blue: 'western_sea', red: 'eastern_sea' }

export const hasSupplyConnection = (state: GameState, regionId: RegionId, faction: FactionId): boolean => {
  if (regionId === HOME_REGIONS[faction]) return true
  const resources = getEffectiveResources(state, regionId, faction)
  if (resources.access < 1 || resources.logistics < 1) return false
  return (Object.keys(ROUTES) as RouteId[])
    .filter((routeId) => ROUTES[routeId].faction === faction && ROUTES[routeId].regions.includes(regionId))
    .some((routeId) => {
      const route = ROUTES[routeId]
      const targetIndex = route.regions.indexOf(regionId)
      return route.regions.slice(0, targetIndex + 1).every((id) => getUsability(state, id, faction) !== 'denied')
    })
}

const patrolDestinations = (state: GameState, source: RegionId, faction: FactionId): RegionId[] => REGION_ORDER.filter((target) => {
  if (target === source || !hasRoom(state, target, faction, 'presence')) return false
  if (REGIONS[source].neighbors.includes(target)) return true
  return REGIONS[source].neighbors.some((intermediate) =>
    getUsability(state, intermediate, faction) !== 'denied' && REGIONS[intermediate].neighbors.includes(target),
  )
})

export const getValidRegionTargets = (state: GameState, cardId: CardId, selected: RegionId[] = []): RegionId[] => {
  const faction = state.activeFaction
  const opponent = otherFaction(faction)
  const all = REGION_ORDER
  switch (cardId) {
    case 'patrol_group':
      if (selected.length === 0) {
        return all.filter((id) => state.regions[id].resources[faction].presence > 0 && patrolDestinations(state, id, faction).length > 0)
      }
      return patrolDestinations(state, selected[0], faction)
    case 'forward_deployment':
      return all.filter((id) => hasRoom(state, id, faction, 'presence') && hasSupplyConnection(state, id, faction))
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
      return all.filter((id) => getEffectiveResources(state, id, faction).awareness > 0 && getEffectiveResources(state, id, opponent).awareness > 0)
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
  const totalCost = card.cost + (play.covert ? 1 : 0)
  if (state.phase !== 'action') throw new Error('Die Partie ist bereits beendet.')
  if (totalCost > state.actionPoints) throw new Error('Nicht genügend Aktionspunkte.')
  if (!isPlayReady(cardId, play)) throw new Error('Die Zielauswahl ist unvollständig.')
  if (play.covert && !COVERT_CARD_IDS.includes(cardId)) throw new Error('Diese Karte kann nicht verdeckt vorbereitet werden.')
  if (cardId === 'deescalation_channel' && state.escalation === 0) {
    throw new Error('Ohne Eskalation ist keine Krisenkommunikation erforderlich.')
  }
  if (cardId === 'detour_expansion') {
    const routeId: RouteId = state.activeFaction === 'blue' ? 'blue_detour' : 'red_detour'
    if (state.routeCapacity[routeId] >= MAX_DETOUR_CAPACITY) throw new Error('Die Ausweich-SLOC hat bereits ihre maximale Kapazität erreicht.')
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
  if (play.covert) {
    const target = selected[0]
    const faction = state.activeFaction
    const opponent = otherFaction(faction)
    if (getEffectiveResources(state, target, faction).awareness < 1 || getEffectiveResources(state, target, opponent).awareness > 1) {
      throw new Error('Verdeckte Operationen benötigen eigenes Lagebild und dürfen nicht von starkem gegnerischem Lagebild erfasst werden.')
    }
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

  if (play.covert) {
    const operation: CovertOperation = {
      id: `covert-${Date.now()}-${Math.random()}`,
      faction,
      card: instance,
      regions: targets,
      resource: play.resource,
      committedRound: next.round,
    }
    next.covertOperations.push(operation)
    next.actionPoints -= card.cost + 1
    next.hands[faction].splice(cardIndex, 1)
    addLog(next, `${FACTIONS[faction].name} hat eine verdeckte Operation vorbereitet.`, faction, 'covert-prepared', { faction })
    return next
  }

  switch (instance.cardId) {
    case 'patrol_group':
      next.regions[targets[0]].resources[faction].presence -= 1
      next.regions[targets[1]].resources[faction].presence += 1
      if (next.regions[targets[1]].resources[faction].awareness === 0 && !hasPatrolAwareness(next, targets[1], faction)) {
        next.patrolAwareness.push({
          id: `patrol-awareness-${Date.now()}-${Math.random()}`,
          faction,
          regionId: targets[1],
          expiresAfterRound: next.round,
        })
      }
      break
    case 'forward_deployment':
      next.regions[targets[0]].resources[faction].presence += 1
      if (next.regions[targets[0]].resources[faction].awareness < 2) {
        next.regions[targets[0]].resources[faction].awareness += 1
      }
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
      reduceAwareness(next, targets[0], opponent)
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
      next.deescalationActions[faction] += 1
      break
    case 'detour_expansion': {
      const routeId: RouteId = faction === 'blue' ? 'blue_detour' : 'red_detour'
      next.routeCapacity[routeId] += 1
      break
    }
  }

  next.actionPoints -= card.cost
  if (card.escalation > 0) {
    next.escalation = Math.min(MAX_ESCALATION, next.escalation + card.escalation)
    next.roundEscalation[faction] += card.escalation
    next.totalEscalation[faction] += card.escalation
    next.escalationActions[faction] += 1
  }
  next.hands[faction].splice(cardIndex, 1)
  next.discards[faction].push(instance)
  const location = targets[0] ? ` · ${REGIONS[targets.at(-1)!].shortName}` : play.routeId ? ` · ${ROUTES[play.routeId].name}` : ''
  const escalationChange = card.escalation > 0 ? ` · Eskalation +${card.escalation}` : instance.cardId === 'deescalation_channel' ? ' · Eskalation −1' : ''
  addLog(next, `${card.title}${location}${escalationChange}`, faction, 'card-played', {
    cardId: instance.cardId,
    regionId: targets.at(-1) ?? '',
    routeId: play.routeId ?? '',
    escalation: card.escalation,
    deescalated: instance.cardId === 'deescalation_channel',
  })
  return next
}

export const resolveCovertOperations = (state: GameState): GameState => {
  if (state.covertOperations.length === 0) return state
  const before = structuredClone(state)
  const next = structuredClone(state)
  next.covertOperations = []
  for (const operation of before.covertOperations) {
    const opponent = otherFaction(operation.faction)
    const target = operation.regions[0]
    let effective = false
    if (operation.card.cardId === 'shadowing_operation') {
      if (getEffectiveResources(before, target, opponent).awareness > 0) effective = reduceAwareness(next, target, opponent)
    } else if (operation.card.cardId === 'hybrid_pressure' && operation.resource) {
      if (getEffectiveResources(before, target, opponent)[operation.resource] > 0) {
        next.suspensions.push({
          id: `covert-suspension-${operation.id}`,
          faction: opponent,
          regionId: target,
          resource: operation.resource,
          amount: 1,
          expiresAfterRound: next.round,
        })
        effective = true
      }
    }
    next.discards[operation.faction].push(operation.card)
    addLog(next, `${FACTIONS[operation.faction].name}: Eine verdeckte Operation ${effective ? 'wurde wirksam' : 'blieb ohne erkennbare Wirkung'}.`, operation.faction, 'covert-resolved', { faction: operation.faction, effective })
  }
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
    return { faction, reason: `${FACTIONS[faction].name} erzielt den höheren wirtschaftlichen Gesamtertrag.`, reasonCode: 'economy' }
  }
  if (state.lastYield.blue.yield !== state.lastYield.red.yield) {
    const faction = state.lastYield.blue.yield > state.lastYield.red.yield ? 'blue' : 'red'
    return { faction, reason: `${FACTIONS[faction].name} verfügt in der Schlussrunde über die leistungsfähigere Seeverbindung.`, reasonCode: 'final-yield' }
  }
  const blueProjection = strategicProjection(state, 'blue')
  const redProjection = strategicProjection(state, 'red')
  if (blueProjection !== redProjection) {
    const faction = blueProjection > redProjection ? 'blue' : 'red'
    return { faction, reason: `${FACTIONS[faction].name} besitzt die stärkere Projektion in den strategischen Kernräumen.`, reasonCode: 'projection' }
  }
  return { faction: null, reason: 'Beide Koalitionen halten Seeverbindungen und Projektion im Gleichgewicht.', reasonCode: 'draw' }
}

const bandScore = (value: number): number => {
  if (value <= 1) return 2
  if (value <= 3) return 1.5
  if (value <= 5) return 1
  if (value <= 7) return 0.5
  return 0
}

const economyScore = (value: number, maxRounds: RoundCount): number => {
  if (value >= maxRounds * 5) return 2
  if (value >= maxRounds * 4) return 1.5
  if (value >= maxRounds * 3) return 1
  if (value >= maxRounds * 2) return 0.5
  return 0
}

const responsibilityScore = (value: number, maxRounds: RoundCount): number => {
  if (value === 0) return 2
  if (value <= maxRounds / 3) return 1.5
  if (value <= (maxRounds * 2) / 3) return 1
  if (value <= maxRounds) return 0.5
  return 0
}

const RATING_LABELS = ['Strategisch gescheitert', 'Riskante Bilanz', 'Kostspielige Führung', 'Kontrollierte Führung', 'Vorbildliche Staatskunst'] as const

const resultScore = (state: GameState, faction: FactionId): number => {
  const difference = state.economicScore[faction] - state.economicScore[otherFaction(faction)]
  const roundedMargin = Math.round((Math.abs(difference) / state.maxRounds) * 10) / 10
  return Math.max(0, Math.min(4, 2 + Math.sign(difference) * roundedMargin))
}

export const calculateLeadershipRating = (state: GameState, faction: FactionId): LeadershipRating => {
  const result = resultScore(state, faction)
  const averageEscalation = state.escalationHistory.length > 0
    ? state.escalationHistory.reduce((sum, value) => sum + value, 0) / state.escalationHistory.length
    : state.lastEvaluationEscalation
  const netResponsibility = Math.max(0, state.totalEscalation[faction] - state.deescalationActions[faction])
  const components = {
    result,
    economy: economyScore(state.economicScore[faction], state.maxRounds),
    escalation: bandScore(averageEscalation),
    responsibility: responsibilityScore(netResponsibility, state.maxRounds),
  }
  const score = components.result + components.economy + components.escalation + components.responsibility
  const stars = Math.max(1, Math.ceil(score / 2)) as LeadershipRating['stars']
  return {
    faction,
    score,
    stars,
    label: RATING_LABELS[stars - 1],
    components,
    metrics: {
      averageYield: state.economicScore[faction] / state.maxRounds,
      averageEscalation,
      escalationActions: state.escalationActions[faction],
      escalationPoints: state.totalEscalation[faction],
      deescalationActions: state.deescalationActions[faction],
      netResponsibility,
    },
  }
}

export const endTurn = (state: GameState): GameState => {
  if (state.phase !== 'action') return state
  let next = structuredClone(state)
  next.endedActionPoints[next.activeFaction] = next.actionPoints
  if (next.turnIndex === 0) {
    next.turnIndex = 1
    next.activeFaction = otherFaction(next.activeFaction)
    next.actionPoints = ACTION_POINTS
    drawCards(next, next.activeFaction, cardsPerTurn(next.maxRounds))
    addLog(next, `${FACTIONS[next.activeFaction].name} übernimmt die Initiative.`, undefined, 'initiative', { faction: next.activeFaction })
    return next
  }

  const covertUsed = {
    blue: next.covertOperations.some((entry) => entry.faction === 'blue'),
    red: next.covertOperations.some((entry) => entry.faction === 'red'),
  }
  next = resolveCovertOperations(next)
  next.lastEvaluationEscalation = next.escalation
  next.escalationHistory.push(next.escalation)
  const blueYield = calculateRoundYield(next, 'blue', { actionPoints: next.endedActionPoints.blue, covertUsed: covertUsed.blue })
  const redYield = calculateRoundYield(next, 'red', { actionPoints: next.endedActionPoints.red, covertUsed: covertUsed.red })
  next.lastYield = { blue: blueYield, red: redYield }
  next.economicScore.blue += blueYield.yield
  next.economicScore.red += redYield.yield
  const signed = (value: number) => value >= 0 ? `+${value}` : String(value)
  addLog(next, `Wirtschaftsauswertung: Blau ${signed(blueYield.yield)} · Rot ${signed(redYield.yield)} · ${getEscalationBand(next.escalation).label}`, undefined, 'evaluation', { blue: blueYield.yield, red: redYield.yield, escalation: next.escalation })
  const roundRisk = next.roundEscalation.blue + next.roundEscalation.red
  if (roundRisk === 0 && !covertUsed.blue && !covertUsed.red && next.escalation > 0) {
    next.escalation -= 1
    addLog(next, 'Eine ruhige Runde senkt die gemeinsame Eskalation um 1.', undefined, 'quiet-round')
  }
  next.suspensions = next.suspensions.filter((entry) => entry.expiresAfterRound > next.round)
  next.protections = next.protections.filter((entry) => entry.expiresAfterRound > next.round)
  next.patrolAwareness = next.patrolAwareness.filter((entry) => entry.expiresAfterRound > next.round)

  if (next.round >= next.maxRounds) {
    next.phase = 'complete'
    next.actionPoints = 0
    next.winner = determineWinner(next)
    addLog(next, `Die ${next.maxRounds}. Wirtschaftsauswertung beendet die Partie.`, undefined, 'game-complete', { rounds: next.maxRounds })
    return next
  }

  next.round += 1
  next.turnIndex = 0
  next.activeFaction = next.round % 2 === 1 ? 'blue' : 'red'
  next.actionPoints = ACTION_POINTS
  next.roundEscalation = { blue: 0, red: 0 }
  next.endedActionPoints = { blue: 0, red: 0 }
  drawCards(next, next.activeFaction, cardsPerTurn(next.maxRounds))
  addLog(next, `Runde ${next.round} beginnt. ${FACTIONS[next.activeFaction].name} handelt zuerst.`, undefined, 'round-start', { round: next.round, faction: next.activeFaction })
  return next
}

export const createFactionView = (state: GameState, faction: FactionId): GameState => {
  const view = structuredClone(state)
  const opponent = otherFaction(faction)
  view.hands[opponent] = []
  view.decks.blue = []
  view.decks.red = []
  view.discards[opponent] = []
  view.covertOperations = view.covertOperations.filter((entry) => entry.faction === faction)
  return view
}

export const migrateGameState = (stored: unknown): GameState => {
  const next = structuredClone(stored) as any
  const sourceVersion = Number(next.version ?? 0)
  if (next.version === 9) return next as GameState
  if (sourceVersion === 8) {
    next.patrolAwareness = []
    next.version = 9
    return next as GameState
  }
  const legacyMatchup = String(next.matchup ?? 'democracy-democracy')
  next.governments = next.governments ?? {
    blue: legacyMatchup.startsWith('autocracy-') ? 'autocracy' : 'democracy',
    red: legacyMatchup.endsWith('-autocracy') ? 'autocracy' : 'democracy',
  }
  if (!GOVERNMENT_OPTIONS.includes(next.governments.blue)) next.governments.blue = DEFAULT_GOVERNMENTS.blue
  if (!GOVERNMENT_OPTIONS.includes(next.governments.red)) next.governments.red = DEFAULT_GOVERNMENTS.red
  next.maxRounds = ROUND_OPTIONS.includes(next.maxRounds) ? next.maxRounds : DEFAULT_ROUNDS
  next.escalation ??= 0
  next.roundEscalation ??= { blue: 0, red: 0 }
  next.totalEscalation ??= { ...next.roundEscalation }
  next.escalationActions ??= { blue: 0, red: 0 }
  next.deescalationActions ??= { blue: 0, red: 0 }
  next.routeCapacity ??= { blue_main: 6, blue_detour: 3, red_main: 6, red_detour: 3 }
  next.endedActionPoints ??= { blue: 0, red: 0 }
  next.lastEvaluationEscalation ??= next.escalation
  const completedRounds = next.phase === 'complete' ? next.maxRounds : Math.max(0, next.round - 1)
  next.escalationHistory ??= Array.from({ length: completedRounds }, () => next.lastEvaluationEscalation)
  if (sourceVersion < 6) {
    next.leadershipHistoryComplete = completedRounds === 0 && next.totalEscalation.blue === 0 && next.totalEscalation.red === 0
  } else {
    next.leadershipHistoryComplete ??= completedRounds === 0 && next.totalEscalation.blue === 0 && next.totalEscalation.red === 0
  }
  next.covertOperations ??= []
  next.patrolAwareness ??= []
  for (const faction of ['blue', 'red'] as const) {
    const zones: CardInstance[] = [
      ...next.decks[faction],
      ...next.hands[faction],
      ...next.discards[faction],
      ...next.covertOperations.filter((operation: CovertOperation) => operation.faction === faction).map((operation: CovertOperation) => operation.card),
    ]
    const copies = next.maxRounds === 6 ? 2 : next.maxRounds === 12 ? 3 : 4
    for (const cardId of CARD_ORDER.filter((id) => id !== 'detour_expansion')) {
      const target = copies + (cardId === 'patrol_group' ? 2 : 0)
      const current = zones.filter((card) => card.cardId === cardId).length
      for (let copy = current; copy < target; copy += 1) {
        next.decks[faction].push({ instanceId: `${faction}-${cardId}-migrated-${copy}`, cardId })
      }
    }
    const detourId: RouteId = faction === 'blue' ? 'blue_detour' : 'red_detour'
    const remainingExpansions = Math.max(0, MAX_DETOUR_CAPACITY - next.routeCapacity[detourId])
    const existingExpansions = zones.filter((card) => card.cardId === 'detour_expansion').length
    for (let copy = existingExpansions; copy < remainingExpansions; copy += 1) {
      next.decks[faction].push({ instanceId: `${faction}-detour_expansion-migrated-${copy}`, cardId: 'detour_expansion' })
    }
    next.decks[faction] = shuffled(next.decks[faction])
    next.lastYield[faction] = {
      ...next.lastYield[faction],
      escalationPenalty: next.lastYield[faction].escalationPenalty ?? 0,
      responsibilityPenalty: next.lastYield[faction].responsibilityPenalty ?? 0,
      governmentBonus: next.lastYield[faction].governmentBonus ?? 0,
      restraintBonus: next.lastYield[faction].restraintBonus ?? 0,
      controlLossPenalty: next.lastYield[faction].controlLossPenalty ?? 0,
    }
  }
  delete next.deescalatedThisRound
  delete next.detourUpgradedRound
  delete next.matchup
  next.version = 9
  return next as GameState
}

export const getCardDefinition = (instance: CardInstance) => CARDS[instance.cardId]

export const constants = { DEFAULT_ROUNDS, ROUND_OPTIONS, DEFAULT_GOVERNMENTS, GOVERNMENT_OPTIONS, ACTION_POINTS, HAND_LIMIT, MAX_ESCALATION, MAX_DETOUR_CAPACITY }

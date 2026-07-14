import { CARDS, CARD_ORDER, EMPTY_RESOURCES, FACTIONS, REGIONS, REGION_ORDER, RESOURCE_LABELS, ROUTES } from './data'
import type {
  CardId,
  CardInstance,
  CardPlay,
  CovertOperation,
  FactionId,
  GameState,
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
const ACTION_POINTS = 3
const HAND_LIMIT = 7
const MAX_ESCALATION = 8
const DETOUR_UPGRADE_COST = 2
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
  const copies = maxRounds === 18 ? 3 : 2
  return shuffled(CARD_ORDER.flatMap((cardId) => Array.from({ length: copies }, (_, copy) => ({ instanceId: `${faction}-${cardId}-${copy}`, cardId }))))
}

const drawCards = (state: GameState, faction: FactionId, count = 1): void => {
  for (let index = 0; index < count; index += 1) {
    if (state.hands[faction].length >= HAND_LIMIT || state.decks[faction].length === 0) return
    const card = state.decks[faction].shift()
    if (card) state.hands[faction].push(card)
  }
}

const addLog = (state: GameState, message: string, faction?: FactionId, code?: string, params?: Record<string, string | number | boolean>): void => {
  state.log.unshift({ id: `${Date.now()}-${Math.random()}`, round: state.round, faction, message, code, params })
  state.log = state.log.slice(0, 16)
}

export const createInitialState = (maxRounds: RoundCount = DEFAULT_ROUNDS): GameState => {
  if (!ROUND_OPTIONS.includes(maxRounds)) throw new Error('Ungültige Rundenzahl.')
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
    version: 5,
    maxRounds,
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
    detourUpgradedRound: { blue: null, red: null },
    escalation: 0,
    roundEscalation: { blue: 0, red: 0 },
    totalEscalation: { blue: 0, red: 0 },
    endedActionPoints: { blue: 0, red: 0 },
    lastEvaluationEscalation: 0,
    lastYield: {
      blue: { routeId: null, yield: 0, blocked: false, contestedRegions: 0, escalationPenalty: 0, responsibilityPenalty: 0, restraintBonus: 0, controlLossPenalty: 0 },
      red: { routeId: null, yield: 0, blocked: false, contestedRegions: 0, escalationPenalty: 0, responsibilityPenalty: 0, restraintBonus: 0, controlLossPenalty: 0 },
    },
    suspensions: [],
    protections: [],
    covertOperations: [],
    log: [],
  }
  drawCards(state, 'blue', 5)
  drawCards(state, 'red', 5)
  drawCards(state, 'blue', 1)
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
    return { routeId, yield: 0, blocked: true, contestedRegions: 0, escalationPenalty, responsibilityPenalty, restraintBonus: 0, controlLossPenalty: 0, reason: 'Kein durchgehender Marktzugang' }
  }
  if (route.kind === 'main' && evaluateChokepoint(state) === opponent) {
    return { routeId, yield: 0, blocked: true, contestedRegions: 0, escalationPenalty, responsibilityPenalty, restraintBonus: 0, controlLossPenalty: 0, reason: 'Meridianstraße gegnerisch kontrolliert' }
  }
  const denied = route.regions.find((regionId) => getUsability(state, regionId, faction) === 'denied')
  if (denied) {
    return { routeId, yield: 0, blocked: true, contestedRegions: 0, escalationPenalty, responsibilityPenalty, restraintBonus: 0, controlLossPenalty: 0, reason: `${REGIONS[denied].shortName} ist verwehrt` }
  }
  const contestedRegions = route.regions.filter((regionId) => getUsability(state, regionId, faction) === 'contested').length
  const protection = state.protections
    .filter((entry) => entry.faction === faction && entry.routeId === routeId)
    .reduce((sum, entry) => sum + entry.amount, 0)
  const effectivePenalty = Math.max(0, contestedRegions - protection)
  return {
    routeId,
    yield: Math.max(0, state.routeCapacity[routeId] - effectivePenalty - escalationPenalty - responsibilityPenalty),
    blocked: false,
    contestedRegions,
    escalationPenalty,
    responsibilityPenalty,
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
  const totalCost = card.cost + (play.covert ? 1 : 0)
  if (state.phase !== 'action') throw new Error('Die Partie ist bereits beendet.')
  if (totalCost > state.actionPoints) throw new Error('Nicht genügend Aktionspunkte.')
  if (!isPlayReady(cardId, play)) throw new Error('Die Zielauswahl ist unvollständig.')
  if (play.covert && !COVERT_CARD_IDS.includes(cardId)) throw new Error('Diese Karte kann nicht verdeckt vorbereitet werden.')
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
      break
    case 'forward_deployment':
      next.regions[targets[0]].resources[faction].presence += 1
      next.regions[targets[0]].resources[faction].awareness = Math.min(2, next.regions[targets[0]].resources[faction].awareness + 1)
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
    next.totalEscalation[faction] += card.escalation
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

export const upgradeDetour = (state: GameState): GameState => {
  if (state.phase !== 'action') throw new Error('Die Partie ist bereits beendet.')
  const faction = state.activeFaction
  if (state.detourUpgradedRound[faction] === state.round) throw new Error('Die Ausweich-SLOC wurde in dieser Runde bereits ausgebaut.')
  const routeId: RouteId = faction === 'blue' ? 'blue_detour' : 'red_detour'
  if (state.routeCapacity[routeId] >= MAX_DETOUR_CAPACITY) throw new Error('Die Ausweich-SLOC hat bereits ihre maximale Kapazität erreicht.')
  if (state.actionPoints < DETOUR_UPGRADE_COST) throw new Error('Nicht genügend Aktionspunkte für den Ausbau.')
  const next = structuredClone(state)
  next.routeCapacity[routeId] += 1
  next.detourUpgradedRound[faction] = next.round
  next.actionPoints -= DETOUR_UPGRADE_COST
  addLog(next, `${FACTIONS[faction].name} baut die Ausweich-SLOC auf Kapazität ${next.routeCapacity[routeId]} aus.`, faction, 'detour-upgraded', { faction, capacity: next.routeCapacity[routeId] })
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
      if (before.regions[target].resources[opponent].awareness > 0) {
        next.regions[target].resources[opponent].awareness = Math.max(0, next.regions[target].resources[opponent].awareness - 1)
        effective = true
      }
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

const responsibilityScore = (value: number): number => {
  if (value === 0) return 2
  if (value <= 2) return 1.5
  if (value <= 4) return 1
  if (value <= 6) return 0.5
  return 0
}

const RATING_LABELS = ['Strategisch gescheitert', 'Riskante Bilanz', 'Kostspielige Führung', 'Kontrollierte Führung', 'Vorbildliche Staatskunst'] as const

export const calculateLeadershipRating = (state: GameState, faction: FactionId): LeadershipRating => {
  const winner = state.winner ?? determineWinner(state)
  const result = winner.faction === faction ? 4 : winner.faction === null ? 2 : 0
  const components = {
    result,
    economy: economyScore(state.economicScore[faction], state.maxRounds),
    escalation: bandScore(state.lastEvaluationEscalation),
    responsibility: responsibilityScore(state.totalEscalation[faction]),
  }
  const score = components.result + components.economy + components.escalation + components.responsibility
  const stars = Math.max(1, Math.ceil(score / 2)) as LeadershipRating['stars']
  return { faction, score, stars, label: RATING_LABELS[stars - 1], components }
}

export const endTurn = (state: GameState): GameState => {
  if (state.phase !== 'action') return state
  let next = structuredClone(state)
  next.endedActionPoints[next.activeFaction] = next.actionPoints
  if (next.turnIndex === 0) {
    next.turnIndex = 1
    next.activeFaction = otherFaction(next.activeFaction)
    next.actionPoints = ACTION_POINTS
    drawCards(next, next.activeFaction)
    addLog(next, `${FACTIONS[next.activeFaction].name} übernimmt die Initiative.`, undefined, 'initiative', { faction: next.activeFaction })
    return next
  }

  const covertUsed = {
    blue: next.covertOperations.some((entry) => entry.faction === 'blue'),
    red: next.covertOperations.some((entry) => entry.faction === 'red'),
  }
  next = resolveCovertOperations(next)
  next.lastEvaluationEscalation = next.escalation
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
  drawCards(next, next.activeFaction)
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
  const next = structuredClone(stored) as GameState & { version: number; deescalatedThisRound?: Record<FactionId, boolean> }
  if (next.version === 5) return next
  next.maxRounds = ROUND_OPTIONS.includes(next.maxRounds) ? next.maxRounds : DEFAULT_ROUNDS
  next.escalation ??= 0
  next.roundEscalation ??= { blue: 0, red: 0 }
  next.totalEscalation ??= { ...next.roundEscalation }
  next.routeCapacity ??= { blue_main: 6, blue_detour: 3, red_main: 6, red_detour: 3 }
  next.detourUpgradedRound ??= { blue: null, red: null }
  next.endedActionPoints ??= { blue: 0, red: 0 }
  next.lastEvaluationEscalation ??= next.escalation
  next.covertOperations ??= []
  for (const faction of ['blue', 'red'] as const) {
    const zones = [...next.decks[faction], ...next.hands[faction], ...next.discards[faction]]
    if (!zones.some((card) => card.cardId === 'deescalation_channel')) {
      next.decks[faction].unshift(
        { instanceId: `${faction}-deescalation_channel-migrated-0`, cardId: 'deescalation_channel' },
        { instanceId: `${faction}-deescalation_channel-migrated-1`, cardId: 'deescalation_channel' },
      )
    }
    next.lastYield[faction] = {
      ...next.lastYield[faction],
      escalationPenalty: next.lastYield[faction].escalationPenalty ?? 0,
      responsibilityPenalty: next.lastYield[faction].responsibilityPenalty ?? 0,
      restraintBonus: next.lastYield[faction].restraintBonus ?? 0,
      controlLossPenalty: next.lastYield[faction].controlLossPenalty ?? 0,
    }
  }
  delete next.deescalatedThisRound
  next.version = 5
  return next
}

export const getCardDefinition = (instance: CardInstance) => CARDS[instance.cardId]

export const constants = { DEFAULT_ROUNDS, ROUND_OPTIONS, ACTION_POINTS, HAND_LIMIT, MAX_ESCALATION, DETOUR_UPGRADE_COST, MAX_DETOUR_CAPACITY }

import { CARDS, ROUTES, ROUTE_ORDER } from './data'
import {
  calculateProjection,
  calculateRoundYield,
  calculateRouteYield,
  createFactionView,
  getEffectiveResources,
  getBestYield,
  getCovertAvailability,
  getUsability,
  getValidHybridResources,
  getValidRegionTargets,
  hasSupplyConnection,
  otherFaction,
  playCard,
  resolveCovertOperations,
} from './engine'
import type { CardInstance, CardPlay, FactionId, GameCommand, GameState, RegionId } from './types'

const STRATEGIC_REGIONS: RegionId[] = ['central_basin', 'meridian_strait', 'freeport_sea']
const HOME_REGIONS: Record<FactionId, RegionId> = { blue: 'western_sea', red: 'eastern_sea' }

const routeIdsFor = (faction: FactionId) => ROUTE_ORDER.filter((routeId) => ROUTES[routeId].faction === faction)

const governmentPositionValue = (state: GameState, faction: FactionId): number => {
  const escalation = state.escalation
  const government = state.governments[faction]
  const opponentGovernment = state.governments[otherFaction(faction)]
  const hasOpenRoute = !getBestYield(state, faction).blocked
  if (escalation >= 8) return -18
  if (government === 'democracy') {
    return escalation <= 2 ? 4 - escalation * 0.25 : -2 - (escalation - 3) * 2
  }
  if (!hasOpenRoute) return escalation <= 5 ? 0 : -(escalation - 5) * 3
  if (escalation < 3) return escalation * 1.25
  if (escalation <= 5) return 5 + (opponentGovernment === 'democracy' ? 2 : 0) - (escalation - 3) * 0.5
  return -3 - (escalation - 6) * 4
}

const maritimeNetworkValue = (state: GameState, faction: FactionId): number => {
  const routeRegions = new Set(routeIdsFor(faction).flatMap((routeId) => ROUTES[routeId].regions))
  return [...routeRegions].reduce((sum, regionId) => {
    const resources = getEffectiveResources(state, regionId, faction)
    const denied = getUsability(state, regionId, faction) === 'denied'
    const infrastructure = resources.access * 1.1 + resources.logistics * 1.1
    const suppliedOutpost = regionId !== HOME_REGIONS[faction]
      && resources.access > 0
      && resources.logistics > 0
      && hasSupplyConnection(state, regionId, faction)
    return sum + infrastructure + (suppliedOutpost ? 1.75 : 0) - (denied ? 2.5 : 0)
  }, 0)
}

const routeResilienceValue = (state: GameState, faction: FactionId): number => {
  const yields = routeIdsFor(faction).map((routeId) => calculateRouteYield(state, routeId))
  const available = yields.filter((result) => !result.blocked).sort((a, b) => b.yield - a.yield)
  if (available.length === 0) return -8
  return available[0].yield + (available[1]?.yield ?? -2) * 0.65
}

const enumerateBasePlays = (state: GameState, card: CardInstance): CardPlay[] => {
  const definition = CARDS[card.cardId]
  if (definition.cost > state.actionPoints) return []
  if (definition.target === 'none') return [{ instanceId: card.instanceId }]
  if (definition.target === 'route') {
    return ROUTE_ORDER
      .filter((routeId) => ROUTES[routeId].faction === state.activeFaction)
      .map((routeId) => ({ instanceId: card.instanceId, routeId }))
  }

  const firstTargets = getValidRegionTargets(state, card.cardId)
  if (definition.target === 'region') {
    return firstTargets.map((regionId) => ({ instanceId: card.instanceId, regions: [regionId] }))
  }
  if (definition.target === 'region-pair') {
    return firstTargets.flatMap((first) =>
      getValidRegionTargets(state, card.cardId, [first]).map((second) => ({ instanceId: card.instanceId, regions: [first, second] })),
    )
  }
  return firstTargets.flatMap((regionId) =>
    getValidHybridResources(state, regionId).map((resource) => ({ instanceId: card.instanceId, regions: [regionId], resource })),
  )
}

const enumeratePlays = (state: GameState, card: CardInstance): CardPlay[] => {
  const base = enumerateBasePlays(state, card)
  if (!(['shadowing_operation', 'hybrid_pressure'] as const).includes(card.cardId as 'shadowing_operation' | 'hybrid_pressure')) return base
  const availability = getCovertAvailability(state, card.cardId)
  if (!availability.available) return base
  const covert = base
    .filter((play) => play.regions?.[0] && availability.targets.includes(play.regions[0]))
    .map((play) => ({ ...play, covert: true }))
  return [...base, ...covert]
}

const evaluateState = (state: GameState, faction: GameState['activeFaction']): number => {
  const opponent = otherFaction(faction)
  const covertUsed = state.covertOperations.some((entry) => entry.faction === faction)
  const preview = covertUsed ? resolveCovertOperations(state) : state
  const ownYield = calculateRoundYield(preview, faction, { actionPoints: state.actionPoints, covertUsed }).yield
  const opposingYield = getBestYield(preview, opponent).yield
  const progress = (state.round - 1) / (state.maxRounds - 1)
  const scoreGap = preview.economicScore[faction] - preview.economicScore[opponent]
  const comebackPressure = scoreGap < 0 ? Math.min(0.35, -scoreGap / Math.max(1, state.maxRounds * 4)) : 0
  const ownYieldWeight = 8.5 * (1 + progress * 0.3 + comebackPressure)
  const opposingYieldWeight = 7 * (1 + progress * 0.25 + (scoreGap > 0 ? 0.1 : 0))
  const strategicBalance = STRATEGIC_REGIONS.reduce(
    (sum, regionId) => sum + calculateProjection(preview, regionId, faction) - calculateProjection(preview, regionId, opponent),
    0,
  )
  const networkWeight = 0.8 + (1 - progress) * 1.4
  const projectionWeight = 2.1 + progress * 0.9
  const netResponsibility = Math.max(0, preview.totalEscalation[faction] - preview.deescalationActions[faction])
  const leadershipWeight = 0.35 + progress * 0.65
  const escalationSafety = preview.escalation <= 5
    ? -preview.escalation * 0.15
    : -0.75 - (preview.escalation - 5) ** 2 * 3
  return ownYield * ownYieldWeight
    - opposingYield * opposingYieldWeight
    + strategicBalance * projectionWeight
    + maritimeNetworkValue(preview, faction) * networkWeight
    + routeResilienceValue(preview, faction) * 1.2
    + governmentPositionValue(preview, faction)
    + escalationSafety
    - preview.roundEscalation[faction] * 2
    - netResponsibility * leadershipWeight
}

const strategicPlayBonus = (state: GameState, play: CardPlay, card: CardInstance): number => {
  const faction = state.activeFaction
  const target = play.regions?.at(-1)
  const handPressure = Math.max(0, state.hands[faction].length - 5) * 0.3
  const futureRounds = Math.max(0, state.maxRounds - state.round)
  const anchoredPatrolAwareness = (play.regions ?? []).filter((regionId) =>
    state.patrolAwareness.some((entry) => entry.faction === faction && entry.regionId === regionId),
  ).length
  if ((card.cardId === 'isr_recon' || card.cardId === 'persistent_sensors') && anchoredPatrolAwareness > 0) {
    return anchoredPatrolAwareness * (1 + futureRounds * 0.4) + handPressure
  }
  if (card.cardId === 'forward_deployment' && target && target !== HOME_REGIONS[faction] && hasSupplyConnection(state, target, faction)) {
    return 1.5 + futureRounds * 0.9 + handPressure
  }
  if ((card.cardId === 'port_agreement' || card.cardId === 'forward_base') && target) {
    const resources = getEffectiveResources(state, target, faction)
    const completesOutpost = card.cardId === 'port_agreement' ? resources.logistics > 0 : resources.access > 0
    return (completesOutpost ? 2 + futureRounds * 1.1 : futureRounds * 0.2) + handPressure
  }
  return handPressure
}

export const chooseAiAction = (state: GameState): GameCommand | null => {
  if (state.phase !== 'action') return null
  const faction = state.activeFaction
  const visibleState = createFactionView(state, faction)
  const baseline = evaluateState(visibleState, faction)
  let best: { command: GameCommand; value: number } | undefined

  for (const card of visibleState.hands[faction]) {
    for (const play of enumeratePlays(visibleState, card)) {
      try {
        const next = playCard(visibleState, play)
        const covertStrategicValue = play.covert ? (card.cardId === 'hybrid_pressure' ? 2.5 : 1.25) : 0
        const value = evaluateState(next, faction) - baseline + covertStrategicValue + strategicPlayBonus(visibleState, play, card)
        if (!best || value > best.value) best = { command: { type: 'play-card', play }, value }
      } catch {
        // The rules engine remains the final authority for every generated option.
      }
    }
  }

  return best && best.value >= 0 ? best.command : null
}

// Compatibility export for callers that only need a card play.
export const chooseAiPlay = (state: GameState): CardPlay | null => {
  const action = chooseAiAction(state)
  return action?.type === 'play-card' ? action.play : null
}

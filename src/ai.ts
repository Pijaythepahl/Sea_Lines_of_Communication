import { CARDS, ROUTES, ROUTE_ORDER } from './data'
import {
  calculateProjection,
  calculateRoundYield,
  createFactionView,
  getBestYield,
  getValidHybridResources,
  getValidRegionTargets,
  otherFaction,
  playCard,
  resolveCovertOperations,
  upgradeDetour,
} from './engine'
import type { CardInstance, CardPlay, GameCommand, GameState, RegionId } from './types'

const STRATEGIC_REGIONS: RegionId[] = ['central_basin', 'meridian_strait', 'freeport_sea']

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
  if (CARDS[card.cardId].cost + 1 > state.actionPoints) return base
  return [...base, ...base.map((play) => ({ ...play, covert: true }))]
}

const evaluateState = (state: GameState, faction: GameState['activeFaction']): number => {
  const opponent = otherFaction(faction)
  const covertUsed = state.covertOperations.some((entry) => entry.faction === faction)
  const preview = covertUsed ? resolveCovertOperations(state) : state
  const ownYield = calculateRoundYield(preview, faction, { actionPoints: state.actionPoints, covertUsed }).yield
  const opposingYield = getBestYield(preview, opponent).yield
  const strategicBalance = STRATEGIC_REGIONS.reduce(
    (sum, regionId) => sum + calculateProjection(preview, regionId, faction) - calculateProjection(preview, regionId, opponent),
    0,
  )
  const scoreBalance = preview.economicScore[faction] - preview.economicScore[opponent]
  const responsibility = preview.roundEscalation[faction]
  const mainId = faction === 'blue' ? 'blue_main' : 'red_main'
  const detourId = faction === 'blue' ? 'blue_detour' : 'red_detour'
  const mainYield = getBestYield(preview, faction).routeId === mainId ? getBestYield(preview, faction).yield : 0
  const insurance = preview.routeCapacity[detourId] * Math.max(1, 6 - mainYield)
  return ownYield * 12 - opposingYield * 9 + strategicBalance * 1.5 + scoreBalance * 2 - responsibility * 4 + insurance
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
        const definition = CARDS[card.cardId]
        const escalationCost = play.covert ? 0 : definition.escalation * 2
        const covertStrategicValue = play.covert ? (card.cardId === 'hybrid_pressure' ? 6 : 3) : 0
        const value = evaluateState(next, faction) - baseline - escalationCost + covertStrategicValue + (definition.cost + (play.covert ? 1 : 0)) * 0.15
        if (!best || value > best.value) best = { command: { type: 'play-card', play }, value }
      } catch {
        // The rules engine remains the final authority for every generated option.
      }
    }
  }

  try {
    const upgraded = upgradeDetour(visibleState)
    const value = evaluateState(upgraded, faction) - baseline + 0.3
    if (!best || value > best.value) best = { command: { type: 'upgrade-detour' }, value }
  } catch {
    // Upgrade is unavailable, already used, or fully developed.
  }

  return best && best.value >= -0.5 ? best.command : null
}

// Compatibility export for callers that only need a card play.
export const chooseAiPlay = (state: GameState): CardPlay | null => {
  const action = chooseAiAction(state)
  return action?.type === 'play-card' ? action.play : null
}

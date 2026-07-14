import { CARDS, ROUTES, ROUTE_ORDER } from './data'
import {
  calculateProjection,
  getBestYield,
  getValidHybridResources,
  getValidRegionTargets,
  otherFaction,
  playCard,
} from './engine'
import type { CardInstance, CardPlay, GameState, RegionId } from './types'

const STRATEGIC_REGIONS: RegionId[] = ['central_basin', 'meridian_strait', 'freeport_sea']

const enumeratePlays = (state: GameState, card: CardInstance): CardPlay[] => {
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
      getValidRegionTargets(state, card.cardId, [first]).map((second) => ({
        instanceId: card.instanceId,
        regions: [first, second],
      })),
    )
  }
  return firstTargets.flatMap((regionId) =>
    getValidHybridResources(state, regionId).map((resource) => ({
      instanceId: card.instanceId,
      regions: [regionId],
      resource,
    })),
  )
}

const evaluateState = (state: GameState, faction: GameState['activeFaction']): number => {
  const opponent = otherFaction(faction)
  const ownYield = getBestYield(state, faction).yield
  const opposingYield = getBestYield(state, opponent).yield
  const strategicBalance = STRATEGIC_REGIONS.reduce(
    (sum, regionId) => sum + calculateProjection(state, regionId, faction) - calculateProjection(state, regionId, opponent),
    0,
  )
  const scoreBalance = state.economicScore[faction] - state.economicScore[opponent]
  const responsibility = state.roundEscalation[faction]
  return ownYield * 12 - opposingYield * 9 + strategicBalance * 1.5 + scoreBalance * 2 - responsibility * 4
}

export const chooseAiPlay = (state: GameState): CardPlay | null => {
  if (state.phase !== 'action') return null
  const faction = state.activeFaction
  const baseline = evaluateState(state, faction)
  let best: { play: CardPlay; value: number } | undefined

  for (const card of state.hands[faction]) {
    for (const play of enumeratePlays(state, card)) {
      try {
        const next = playCard(state, play)
        const definition = CARDS[card.cardId]
        const value = evaluateState(next, faction) - baseline - definition.escalation * 2 + definition.cost * 0.15
        if (!best || value > best.value) best = { play, value }
      } catch {
        // The rules engine remains the final authority for every generated option.
      }
    }
  }

  if (!best) return null
  // Avoid spending cards that do not improve the strategic position unless AP would otherwise go unused.
  return best.value >= -0.5 ? best.play : null
}

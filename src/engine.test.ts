import { describe, expect, it } from 'vitest'
import {
  calculateLeadershipRating,
  calculateRoundYield,
  calculateRouteYield,
  createFactionView,
  createInitialState,
  endTurn,
  evaluateChokepoint,
  getEffectiveResources,
  getUsability,
  migrateGameState,
  playCard,
  resolveCovertOperations,
} from './engine'
import type { CardId, CardInstance, GameState } from './types'

const putCardInBlueHand = (state: GameState, cardId: CardId): CardInstance => {
  const existing = state.hands.blue.find((card) => card.cardId === cardId)
  if (existing) return existing
  const deckIndex = state.decks.blue.findIndex((card) => card.cardId === cardId)
  const card = state.decks.blue.splice(deckIndex, 1)[0]
  state.hands.blue.push(card)
  return card
}

describe('relative Nutzbarkeit', () => {
  it('lässt gleich starke Seiten denselben Raum frei nutzen', () => {
    const state = createInitialState()
    expect(getUsability(state, 'central_basin', 'blue')).toBe('free')
    expect(getUsability(state, 'central_basin', 'red')).toBe('free')
  })

  it('unterscheidet umkämpfte und verwehrte Räume', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.blue.presence = 1
    expect(getUsability(state, 'central_basin', 'red')).toBe('contested')
    state.regions.central_basin.resources.blue.presence = 3
    expect(getUsability(state, 'central_basin', 'red')).toBe('denied')
  })

  it('lässt den neutralen Freihafen auch bei großer Unterlegenheit höchstens umkämpft werden', () => {
    const state = createInitialState()
    state.regions.freeport_sea.resources.red = { presence: 3, awareness: 3, access: 2, logistics: 2 }
    expect(getUsability(state, 'freeport_sea', 'blue')).toBe('contested')
    state.regions.freeport_sea.resources.blue.access = 0
    expect(calculateRouteYield(state, 'blue_detour')).toMatchObject({ blocked: true, reason: 'Kein durchgehender Marktzugang' })
  })
})

describe('Engpass und Handelsrouten', () => {
  it('sperrt die gegnerische Hauptroute, aber nicht deren Ausweichroute', () => {
    const state = createInitialState()
    state.regions.meridian_strait.resources.red.presence = 2
    state.regions.meridian_strait.resources.red.access = 1
    expect(evaluateChokepoint(state)).toBe('red')
    expect(calculateRouteYield(state, 'blue_main').blocked).toBe(true)
    expect(calculateRouteYield(state, 'blue_detour')).toMatchObject({ blocked: false, yield: 3 })
  })

  it('reduziert den Malus einer umkämpften Route durch Konvoisicherung', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.red.presence = 1
    expect(calculateRouteYield(state, 'blue_main').yield).toBe(5)
    state.protections.push({ id: 'test', faction: 'blue', routeId: 'blue_main', amount: 1, expiresAfterRound: 1 })
    expect(calculateRouteYield(state, 'blue_main').yield).toBe(6)
  })

  it('baut die Ausweichroute mit Zusätzlicher Tonnage für 1 AP dauerhaft bis höchstens 5 aus', () => {
    const state = createInitialState()
    const card = putCardInBlueHand(state, 'detour_expansion')
    const upgraded = playCard(state, { instanceId: card.instanceId })
    expect(upgraded.routeCapacity.blue_detour).toBe(4)
    expect(upgraded.actionPoints).toBe(2)
    const secondCard = putCardInBlueHand(upgraded, 'detour_expansion')
    const fullyUpgraded = playCard(upgraded, { instanceId: secondCard.instanceId })
    expect(fullyUpgraded.routeCapacity.blue_detour).toBe(5)
    const extra = { instanceId: 'test-extra-detour', cardId: 'detour_expansion' as const }
    fullyUpgraded.hands.blue.push(extra)
    expect(() => playCard(fullyUpgraded, { instanceId: extra.instanceId })).toThrow(/maximale Kapazität/)
  })

  it('verwendet die ausgebaute Kapazität, sobald die Hauptroute blockiert ist', () => {
    const state = createInitialState()
    state.routeCapacity.blue_detour = 5
    state.regions.meridian_strait.resources.red = { presence: 2, awareness: 0, access: 1, logistics: 0 }
    expect(calculateRouteYield(state, 'blue_main').blocked).toBe(true)
    expect(calculateRouteYield(state, 'blue_detour').yield).toBe(5)
  })
})

describe('Karten und Rundenfolge', () => {
  it('verbessert beim Aufbau von Präsenz das Lagebild bis 2, aber nicht beim bloßen Verlegen', () => {
    const state = createInitialState()
    const deployment = putCardInBlueHand(state, 'forward_deployment')
    const reinforced = playCard(state, { instanceId: deployment.instanceId, regions: ['western_sea'] })
    expect(reinforced.regions.western_sea.resources.blue).toMatchObject({ presence: 3, awareness: 2 })

    const patrolState = createInitialState()
    const patrol = putCardInBlueHand(patrolState, 'patrol_group')
    const moved = playCard(patrolState, { instanceId: patrol.instanceId, regions: ['western_sea', 'southwest_arc'] })
    expect(moved.regions.southwest_arc.resources.blue).toMatchObject({ presence: 1, awareness: 0 })
  })

  it('begrenzt den Lagebildbonus aus Präsenzaufbau auf 2', () => {
    const state = createInitialState()
    state.regions.western_sea.resources.blue.awareness = 2
    const deployment = putCardInBlueHand(state, 'forward_deployment')
    const reinforced = playCard(state, { instanceId: deployment.instanceId, regions: ['western_sea'] })
    expect(reinforced.regions.western_sea.resources.blue.awareness).toBe(2)
  })

  it('suspendiert gegnerische Ressourcen nur bis zur nächsten Wirtschaftsauswertung', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.red.logistics = 1
    const card = putCardInBlueHand(state, 'hybrid_pressure')
    const pressured = playCard(state, { instanceId: card.instanceId, regions: ['central_basin'], resource: 'logistics' })
    expect(getEffectiveResources(pressured, 'central_basin', 'red').logistics).toBe(0)
    expect(pressured.escalation).toBe(2)
    expect(pressured.roundEscalation.blue).toBe(2)
    const redTurn = endTurn(pressured)
    const nextRound = endTurn(redTurn)
    expect(nextRound.round).toBe(2)
    expect(getEffectiveResources(nextRound, 'central_basin', 'red').logistics).toBe(1)
  })

  it('preist globale Eskalation und eigene Verantwortung in den Routenertrag ein', () => {
    const state = createInitialState()
    state.escalation = 4
    state.roundEscalation.blue = 1
    expect(calculateRouteYield(state, 'blue_main')).toMatchObject({
      yield: 3,
      escalationPenalty: 2,
      responsibilityPenalty: 1,
    })
    expect(calculateRouteYield(state, 'red_main')).toMatchObject({
      yield: 4,
      escalationPenalty: 2,
      responsibilityPenalty: 0,
    })
  })

  it('senkt Eskalation mit der Karte Krisenkommunikation gegen einen Aktionspunkt', () => {
    const state = createInitialState()
    state.escalation = 3
    const card = putCardInBlueHand(state, 'deescalation_channel')
    const calmer = playCard(state, { instanceId: card.instanceId })
    expect(calmer.escalation).toBe(2)
    expect(calmer.actionPoints).toBe(2)
    expect(calmer.deescalationActions.blue).toBe(1)
    expect(calmer.discards.blue.at(-1)?.cardId).toBe('deescalation_channel')
  })

  it('lässt Krisenkommunikation bei Eskalation null nicht ausspielen', () => {
    const state = createInitialState()
    const card = putCardInBlueHand(state, 'deescalation_channel')
    expect(() => playCard(state, { instanceId: card.instanceId })).toThrow(/keine Krisenkommunikation/)
  })

  it('senkt Eskalation nach einer vollständig ruhigen Runde automatisch', () => {
    const state = createInitialState()
    state.escalation = 3
    const redTurn = endTurn(state)
    const nextRound = endTurn(redTurn)
    expect(nextRound.escalation).toBe(2)
  })

  it('vergibt höchstens einen Ruhebonus für einen friedlichen Zug mit Rest-AP', () => {
    const state = createInitialState()
    state.endedActionPoints.blue = 3
    expect(calculateRoundYield(state, 'blue')).toMatchObject({ yield: 7, restraintBonus: 1 })
    state.roundEscalation.blue = 1
    expect(calculateRoundYield(state, 'blue')).toMatchObject({ restraintBonus: 0 })
  })

  it('wertet Kontrollverlust unabhängig von blockierten Routen mit −1 oder −2', () => {
    const state = createInitialState()
    state.escalation = 8
    state.regions.eastern_sea.resources.red.access = 0
    state.roundEscalation.blue = 1
    expect(calculateRoundYield(state, 'blue').yield).toBe(-2)
    expect(calculateRoundYield(state, 'red')).toMatchObject({ yield: -1, controlLossPenalty: 1 })
  })

  it('bereitet geeignete Karten nur bei schwachem gegnerischem Lagebild verdeckt vor', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.blue.awareness = 1
    state.regions.central_basin.resources.red.awareness = 1
    const card = putCardInBlueHand(state, 'shadowing_operation')
    const prepared = playCard(state, { instanceId: card.instanceId, regions: ['central_basin'], covert: true })
    expect(prepared.actionPoints).toBe(1)
    expect(prepared.escalation).toBe(0)
    expect(prepared.regions.central_basin.resources.red.awareness).toBe(1)
    expect(prepared.covertOperations).toHaveLength(1)
    expect(prepared.log[0].message).not.toMatch(/Beschattung|Zentral/)
    state.regions.central_basin.resources.red.awareness = 2
    expect(() => playCard(state, { instanceId: card.instanceId, regions: ['central_basin'], covert: true })).toThrow(/gegnerischem Lagebild/)
  })

  it('löst verdeckte Wirkungen verzögert auf und hält ihre Details aus der Gegnersicht', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.blue.awareness = 1
    state.regions.central_basin.resources.red.awareness = 1
    state.regions.central_basin.resources.red.logistics = 1
    const card = putCardInBlueHand(state, 'hybrid_pressure')
    const prepared = playCard(state, { instanceId: card.instanceId, regions: ['central_basin'], resource: 'logistics', covert: true })
    const redView = createFactionView(prepared, 'red')
    expect(redView.covertOperations).toHaveLength(0)
    expect(redView.discards.blue).toHaveLength(0)
    const resolved = resolveCovertOperations(prepared)
    expect(getEffectiveResources(resolved, 'central_basin', 'red').logistics).toBe(0)
    expect(resolved.covertOperations).toHaveLength(0)
    expect(resolved.log[0].message).not.toMatch(/Hybrider Druck|Zentral|Logistik/)
  })

  it('verhindert mit einer verdeckten Operation die automatische Deeskalation', () => {
    const state = createInitialState()
    state.escalation = 3
    state.regions.central_basin.resources.blue.awareness = 1
    state.regions.central_basin.resources.red.awareness = 1
    const card = putCardInBlueHand(state, 'shadowing_operation')
    const prepared = playCard(state, { instanceId: card.instanceId, regions: ['central_basin'], covert: true })
    const redTurn = endTurn(prepared)
    const nextRound = endTurn(redTurn)
    expect(nextRound.escalation).toBe(3)
    expect(nextRound.lastYield.blue.restraintBonus).toBe(0)
  })

  it('wechselt die Startinitiative in jeder Runde', () => {
    const roundOne = createInitialState()
    expect(roundOne.activeFaction).toBe('blue')
    const roundOneSecondTurn = endTurn(roundOne)
    expect(roundOneSecondTurn.activeFaction).toBe('red')
    const roundTwo = endTurn(roundOneSecondTurn)
    expect(roundTwo.round).toBe(2)
    expect(roundTwo.activeFaction).toBe('red')
  })

  it('respektiert Ressourcenobergrenzen bei legalen Kartenzielen', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.blue.awareness = 3
    const card = putCardInBlueHand(state, 'isr_recon')
    expect(() => playCard(state, { instanceId: card.instanceId, regions: ['central_basin'] })).toThrow(/nicht zulässig/)
  })
})

describe('Migration und Abschlussbewertung', () => {
  it('migriert ältere Spielstände auf MVP 6 und sechs Runden', () => {
    const legacy = structuredClone(createInitialState()) as unknown as Record<string, unknown>
    legacy.version = 4
    delete legacy.maxRounds
    delete legacy.routeCapacity
    delete legacy.covertOperations
    const migrated = migrateGameState(legacy)
    expect(migrated.version).toBe(6)
    expect(migrated.maxRounds).toBe(6)
    expect(migrated.routeCapacity).toMatchObject({ blue_main: 6, blue_detour: 3 })
    expect(migrated.covertOperations).toEqual([])
  })

  it('beendet Partien nach der gewählten Rundenzahl und baut Decks 24/34/44 mit mehr Patrouillen', () => {
    const state = createInitialState(12)
    state.round = 12
    const secondTurn = endTurn(state)
    const complete = endTurn(secondTurn)
    expect(complete.phase).toBe('complete')
    expect(complete.round).toBe(12)

    for (const [rounds, size, patrols] of [[6, 24, 4], [12, 34, 5], [18, 44, 6]] as const) {
      const game = createInitialState(rounds)
      const cards = [...game.decks.blue, ...game.hands.blue]
      expect(cards).toHaveLength(size)
      expect(cards.filter((card) => card.cardId === 'patrol_group')).toHaveLength(patrols)
      expect(cards.filter((card) => card.cardId === 'detour_expansion')).toHaveLength(2)
      expect(game.hands.blue).toHaveLength(rounds === 6 ? 6 : 7)
      expect(endTurn(game).hands.red).toHaveLength(rounds === 6 ? 6 : 7)
    }
  })

  it('ergänzt bei der Migration nur die noch nutzbaren Ausbaukarten', () => {
    const legacy = structuredClone(createInitialState(12)) as any
    legacy.version = 5
    legacy.round = 2
    legacy.routeCapacity.blue_detour = 4
    legacy.decks.blue = legacy.decks.blue.filter((card: CardInstance) => card.cardId !== 'detour_expansion')
    legacy.hands.blue = legacy.hands.blue.filter((card: CardInstance) => card.cardId !== 'detour_expansion')
    const migrated = migrateGameState(legacy)
    const blueCards = [...migrated.decks.blue, ...migrated.hands.blue, ...migrated.discards.blue]
    expect(blueCards.filter((card) => card.cardId === 'detour_expansion')).toHaveLength(1)
    expect(migrated.leadershipHistoryComplete).toBe(false)
  })

  it('skaliert die Wirtschaftsanteile der Führungswertung mit der Rundenzahl', () => {
    const short = createInitialState(6)
    short.economicScore.blue = 18
    short.winner = { faction: 'blue', reason: 'Test' }
    expect(calculateLeadershipRating(short, 'blue').components.economy).toBe(1)

    const long = createInitialState(12)
    long.economicScore.blue = 36
    long.winner = { faction: 'blue', reason: 'Test' }
    expect(calculateLeadershipRating(long, 'blue').components.economy).toBe(1)
  })

  it('berechnet Sterne getrennt vom wirtschaftlichen Sieger', () => {
    const state = createInitialState()
    state.phase = 'complete'
    state.economicScore = { blue: 31, red: 20 }
    state.lastEvaluationEscalation = 8
    state.totalEscalation.blue = 8
    state.winner = { faction: 'blue', reason: 'Test' }
    expect(calculateLeadershipRating(state, 'blue')).toMatchObject({ score: 6, stars: 3, label: 'Kostspielige Führung' })
    expect(calculateLeadershipRating(state, 'red').stars).toBeGreaterThanOrEqual(1)
  })

  it('bewertet Eskalationsverlauf und deeskalierendes Verhalten über die gesamte Partie', () => {
    const state = createInitialState(12)
    state.winner = { faction: 'blue', reason: 'Test' }
    state.escalationHistory = [1, 3, 5, 3]
    state.totalEscalation.blue = 6
    state.escalationActions.blue = 4
    state.deescalationActions.blue = 2
    const rating = calculateLeadershipRating(state, 'blue')
    expect(rating.components.escalation).toBe(1.5)
    expect(rating.components.responsibility).toBe(1.5)
    expect(rating.metrics).toMatchObject({ averageEscalation: 3, escalationActions: 4, escalationPoints: 6, deescalationActions: 2, netResponsibility: 4 })
  })
})

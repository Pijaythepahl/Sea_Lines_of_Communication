export type FactionId = 'blue' | 'red'
export type RoundCount = 6 | 12 | 18
export type GovernmentType = 'democracy' | 'autocracy'
export type GovernmentSelection = Record<FactionId, GovernmentType>

export type RegionId =
  | 'western_sea'
  | 'eastern_sea'
  | 'northwest_passage'
  | 'northeast_passage'
  | 'central_basin'
  | 'meridian_strait'
  | 'southwest_arc'
  | 'southeast_arc'
  | 'freeport_sea'

export type RouteId = 'blue_main' | 'blue_detour' | 'red_main' | 'red_detour'
export type ResourceKey = 'presence' | 'awareness' | 'access' | 'logistics'
export type SuspendableResource = 'access' | 'logistics'
export type Usability = 'free' | 'contested' | 'denied'
export type GamePhase = 'action' | 'complete'
export type CardId =
  | 'patrol_group'
  | 'forward_deployment'
  | 'isr_recon'
  | 'persistent_sensors'
  | 'port_agreement'
  | 'forward_base'
  | 'convoy_escort'
  | 'shadowing_operation'
  | 'hybrid_pressure'
  | 'deescalation_channel'
  | 'detour_expansion'

export interface ResourceLevels {
  presence: number
  awareness: number
  access: number
  logistics: number
}

export interface RegionDefinition {
  id: RegionId
  name: string
  shortName: string
  subtitle: string
  x: number
  y: number
  coastal: boolean
  chokepoint?: boolean
  market?: boolean
  mapPath: string
  neighbors: RegionId[]
}

export interface RegionState {
  id: RegionId
  resources: Record<FactionId, ResourceLevels>
}

export interface RouteDefinition {
  id: RouteId
  faction: FactionId
  name: string
  kind: 'main' | 'detour'
  baseYield: number
  regions: RegionId[]
  svgPath: string
}

export type CardTarget = 'region' | 'region-pair' | 'route' | 'hybrid-resource' | 'none'

export interface CardDefinition {
  id: CardId
  title: string
  domain: string
  icon: string
  cost: number
  target: CardTarget
  description: string
  instruction: string
  playHint: string
  escalation: 0 | 1 | 2
  escalationReason?: string
}

export interface CardInstance {
  instanceId: string
  cardId: CardId
}

export interface CardPlay {
  instanceId: string
  regions?: RegionId[]
  routeId?: RouteId
  resource?: SuspendableResource
  covert?: boolean
}

export type GameCommand =
  | { type: 'play-card'; play: CardPlay }
  | { type: 'end-turn' }

export interface TemporarySuspension {
  id: string
  faction: FactionId
  regionId: RegionId
  resource: SuspendableResource
  amount: number
  expiresAfterRound: number
}

export interface PatrolAwareness {
  id: string
  faction: FactionId
  regionId: RegionId
  expiresAfterRound: number
}

export interface RouteProtection {
  id: string
  faction: FactionId
  routeId: RouteId
  amount: number
  expiresAfterRound: number
}

export interface YieldResult {
  routeId: RouteId | null
  yield: number
  blocked: boolean
  contestedRegions: number
  escalationPenalty: number
  responsibilityPenalty: number
  governmentBonus: number
  restraintBonus: number
  controlLossPenalty: number
  reason?: string
}

export interface CovertOperation {
  id: string
  faction: FactionId
  card: CardInstance
  regions: RegionId[]
  resource?: SuspendableResource
  committedRound: number
}

export interface LogEntry {
  id: string
  round: number
  faction?: FactionId
  message: string
  code?: string
  params?: Record<string, string | number | boolean>
}

export interface WinnerResult {
  faction: FactionId | null
  reason: string
  reasonCode?: 'economy' | 'final-yield' | 'projection' | 'draw'
}

export interface LeadershipRating {
  faction: FactionId
  score: number
  stars: 1 | 2 | 3 | 4 | 5
  label: string
  components: {
    result: number
    economy: number
    escalation: number
    responsibility: number
  }
  metrics: {
    averageYield: number
    averageEscalation: number
    escalationActions: number
    escalationPoints: number
    deescalationActions: number
    netResponsibility: number
  }
}

export interface GameState {
  version: 9
  maxRounds: RoundCount
  governments: GovernmentSelection
  round: number
  phase: GamePhase
  activeFaction: FactionId
  turnIndex: 0 | 1
  actionPoints: number
  regions: Record<RegionId, RegionState>
  decks: Record<FactionId, CardInstance[]>
  hands: Record<FactionId, CardInstance[]>
  discards: Record<FactionId, CardInstance[]>
  economicScore: Record<FactionId, number>
  routeCapacity: Record<RouteId, number>
  escalation: number
  roundEscalation: Record<FactionId, number>
  totalEscalation: Record<FactionId, number>
  escalationActions: Record<FactionId, number>
  deescalationActions: Record<FactionId, number>
  escalationHistory: number[]
  leadershipHistoryComplete: boolean
  endedActionPoints: Record<FactionId, number>
  lastEvaluationEscalation: number
  lastYield: Record<FactionId, YieldResult>
  patrolAwareness: PatrolAwareness[]
  suspensions: TemporarySuspension[]
  protections: RouteProtection[]
  covertOperations: CovertOperation[]
  log: LogEntry[]
  winner?: WinnerResult
}

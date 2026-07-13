export type FactionId = 'blue' | 'red'

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
}

export interface TemporarySuspension {
  id: string
  faction: FactionId
  regionId: RegionId
  resource: SuspendableResource
  amount: number
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
  reason?: string
}

export interface LogEntry {
  id: string
  round: number
  faction?: FactionId
  message: string
}

export interface WinnerResult {
  faction: FactionId | null
  reason: string
}

export interface GameState {
  version: 3
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
  escalation: number
  roundEscalation: Record<FactionId, number>
  lastYield: Record<FactionId, YieldResult>
  suspensions: TemporarySuspension[]
  protections: RouteProtection[]
  log: LogEntry[]
  winner?: WinnerResult
}

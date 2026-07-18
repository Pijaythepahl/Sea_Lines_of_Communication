import type { FactionId, GameCommand, GameState, GovernmentType, RoundCount } from './types'

export type RoomStatus = 'waiting' | 'playing' | 'complete'
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export interface OnlineSession {
  roomCode: string
  faction: FactionId
  token: string
}

export interface RematchProposal {
  requestedBy: FactionId
  maxRounds: RoundCount
  government: GovernmentType
}

export interface RoomSnapshot {
  type: 'snapshot'
  roomCode: string
  status: RoomStatus
  revision: number
  state: GameState
  seats: Record<FactionId, boolean>
  connected: Record<FactionId, boolean>
  rematchProposal?: RematchProposal
}

export type RoomCommand =
  | (GameCommand & { revision: number })
  | { type: 'request-rematch'; maxRounds: RoundCount; government: GovernmentType; revision: number }
  | { type: 'accept-rematch'; government: GovernmentType; revision: number }
  | { type: 'decline-rematch'; revision: number }
  | { type: 'cancel-rematch'; revision: number }

interface SessionResponse {
  session: OnlineSession
  snapshot: RoomSnapshot
}

const parseResponse = async (response: Response): Promise<SessionResponse> => {
  const body = await response.json() as SessionResponse | { error?: string }
  if (!response.ok || !('session' in body)) {
    throw new Error('error' in body && body.error ? body.error : 'Der Spielraum konnte nicht erreicht werden.')
  }
  return body
}

export const createOnlineRoom = async (maxRounds: RoundCount, blueGovernment: GovernmentType): Promise<SessionResponse> =>
  parseResponse(await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxRounds, blueGovernment }),
  }))

export const joinOnlineRoom = async (roomCode: string, redGovernment: GovernmentType): Promise<SessionResponse> =>
  parseResponse(await fetch(`/api/rooms/${encodeURIComponent(roomCode.trim().toUpperCase())}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ government: redGovernment }),
  }))

export const socketUrl = (session: OnlineSession): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(session.roomCode)}/socket?token=${encodeURIComponent(session.token)}`
}

export const isRoomSnapshot = (value: unknown): value is RoomSnapshot => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RoomSnapshot>
  return candidate.type === 'snapshot' && typeof candidate.roomCode === 'string' && typeof candidate.revision === 'number' && Boolean(candidate.state)
}

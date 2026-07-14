import type { FactionId, GameCommand, GameState } from './types'

export type RoomStatus = 'waiting' | 'playing' | 'complete'
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export interface OnlineSession {
  roomCode: string
  faction: FactionId
  token: string
}

export interface RoomSnapshot {
  type: 'snapshot'
  roomCode: string
  status: RoomStatus
  revision: number
  state: GameState
  seats: Record<FactionId, boolean>
  connected: Record<FactionId, boolean>
}

export type RoomCommand = GameCommand & { revision: number }

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

export const createOnlineRoom = async (): Promise<SessionResponse> =>
  parseResponse(await fetch('/api/rooms', { method: 'POST' }))

export const joinOnlineRoom = async (roomCode: string): Promise<SessionResponse> =>
  parseResponse(await fetch(`/api/rooms/${encodeURIComponent(roomCode.trim().toUpperCase())}/join`, { method: 'POST' }))

export const socketUrl = (session: OnlineSession): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(session.roomCode)}/socket?token=${encodeURIComponent(session.token)}`
}

export const isRoomSnapshot = (value: unknown): value is RoomSnapshot => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RoomSnapshot>
  return candidate.type === 'snapshot' && typeof candidate.roomCode === 'string' && typeof candidate.revision === 'number' && Boolean(candidate.state)
}

export const MUSIC_TRACKS = {
  title: '/audio/music/title-theme.ogg',
  high: '/audio/music/escalation-high.ogg',
  maximum: '/audio/music/escalation-maximum.ogg',
} as const

export const getMusicTrackForEscalation = (escalation: number) => {
  if (escalation <= 2) return MUSIC_TRACKS.title
  if (escalation <= 5) return MUSIC_TRACKS.high
  return MUSIC_TRACKS.maximum
}

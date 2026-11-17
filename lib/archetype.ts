// Picks a "Discord archetype" from stats the Wrapped already has.
// Two parts: where you spend your Discord life (the habitat) and how (the habit),
// e.g. "Night-Owl DM Dweller". Every reason shown is a real number from the stats.

export interface ArchetypeInput {
  totalMessages: number
  nightOwlCount: number
  earlyBirdCount: number
  weekendCount: number
  burstSequences: number
  emojiOnlyCount: number
  dmMessages?: number
  groupMessages?: number
  serverMessages?: number
  voiceSeconds?: number
  lurkerIndex?: number
  channelOpens?: number
  hasActivityData?: boolean
}

export interface Archetype {
  title: string
  tagline: string
  reasons: string[]
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

export function computeArchetype(data: ArchetypeInput): Archetype | null {
  const total = data.totalMessages
  if (!total) return null

  const privateMessages = (data.dmMessages ?? 0) + (data.groupMessages ?? 0)
  const serverMessages = data.serverMessages ?? 0
  const written = privateMessages + serverMessages
  const dmShare = written > 0 ? privateMessages / written : 0
  const voiceHours = (data.voiceSeconds ?? 0) / 3600
  const lurker = data.hasActivityData && (data.channelOpens ?? 0) > 200 ? (data.lurkerIndex ?? 0) / 100 : 0

  // Habitat: the strongest signal wins
  const habitats = [
    { noun: 'DM Dweller', score: written > 0 ? dmShare : 0, tagline: 'Your real Discord lives in private chats.', reason: `${Math.round(dmShare * 100)}% of your messages went to DMs and group chats` },
    { noun: 'Server Regular', score: written > 0 ? (1 - dmShare) * 0.95 : 0, tagline: 'You know every channel and every inside joke.', reason: `${Math.round((1 - dmShare) * 100)}% of your messages went to servers` },
    { noun: 'Voice Dweller', score: Math.min(1, voiceHours / 150), tagline: 'Why type when you can just talk?', reason: `${Math.round(voiceHours).toLocaleString('en-US')} hours in voice chat` },
    { noun: 'Silent Lurker', score: lurker * 0.9, tagline: 'You read everything. You say… some of it.', reason: `${Math.round(lurker * 100)}% of the channels you opened, you only read` },
  ].sort((a, b) => b.score - a.score)
  const habitat = habitats[0]

  // Habit: the most unusual rhythm, if any stands out
  const night = pct(data.nightOwlCount, total)
  const early = pct(data.earlyBirdCount, total)
  const weekend = pct(data.weekendCount, total)
  const burst = pct(data.burstSequences, total)
  const emojiOnly = pct(data.emojiOnlyCount, total)
  const habits = [
    // Thresholds: roughly where a habit stops being ordinary. Most chatters send
    // well over half their messages in quick runs, so Rapid-Fire needs a lot.
    { prefix: 'Night-Owl', score: night / 10, reason: `${night}% of your messages between midnight and 5 AM` },
    { prefix: 'Early-Bird', score: early / 12, reason: `${early}% of your messages between 5 and 9 AM` },
    { prefix: 'Weekend', score: weekend / 40, reason: `${weekend}% of your messages on weekends` },
    { prefix: 'Rapid-Fire', score: burst / 88, reason: `${burst}% of your messages sent within 30 s of the last one` },
    { prefix: 'Emoji-Fluent', score: emojiOnly / 8, reason: `${emojiOnly}% of your messages were only emojis` },
  ].sort((a, b) => b.score - a.score)
  const habit = habits[0].score >= 1 ? habits[0] : null

  const reasons = [habitat.reason]
  if (habit) reasons.push(habit.reason)
  // One supporting fact from the runner-up habitat, when it is strong too
  if (habitats[1].score >= 0.5) reasons.push(habitats[1].reason)

  return {
    title: habit ? `${habit.prefix} ${habitat.noun}` : `The ${habitat.noun}`,
    tagline: habitat.tagline,
    reasons,
  }
}

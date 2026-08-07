import { CARD_ORDER } from './data'
import { pick, type Language } from './i18n'
import type { CardId } from './types'

export const HELP_CHAPTER_IDS = [
  'mission',
  'turn',
  'map',
  'projection',
  'slocs',
  'cards',
  'crisis',
  'leadership',
] as const

export type HelpChapterId = (typeof HELP_CHAPTER_IDS)[number]
export type StrategistId = 'mahan' | 'corbett' | 'wegener' | 'modern'

export interface HelpChapter {
  id: HelpChapterId
  navLabel: string
  eyebrow: string
  title: string
  subtitle: string
  strategists: StrategistId[]
}

export interface StrategistDefinition {
  id: StrategistId
  name: string
  question: string
  idea: string
}

export const HELP_CARD_IDS: readonly CardId[] = [...CARD_ORDER]

export const getStrategists = (language: Language): Record<StrategistId, StrategistDefinition> => ({
  mahan: {
    id: 'mahan',
    name: 'Mahan',
    question: pick(language, 'Wozu wirkt Seemacht?', 'What is sea power for?'),
    idea: pick(language, 'Wirtschaftliche Wirkung, Handel, Präsenz und staatliche Handlungsfähigkeit.', 'Economic effect, trade, presence, and national capacity to act.'),
  },
  corbett: {
    id: 'corbett',
    name: 'Corbett',
    question: pick(language, 'Welche Verbindung muss nutzbar bleiben?', 'Which connection must remain usable?'),
    idea: pick(language, 'Kontrolle maritimer Kommunikation statt Besitz von Wasserterritorium.', 'Control of maritime communications rather than ownership of sea territory.'),
  },
  wegener: {
    id: 'wegener',
    name: 'Wegener',
    question: pick(language, 'Wo muss Stärke wirken?', 'Where must strength take effect?'),
    idea: pick(language, 'Geografie, Engpässe, Zugang und Stützpunkte machen Stärke wirksam.', 'Geography, chokepoints, access, and bases turn strength into effect.'),
  },
  modern: {
    id: 'modern',
    name: pick(language, 'Moderne Erweiterung', 'Modern extension'),
    question: pick(language, 'Was verändert die heutige Lage?', 'What changes the contemporary situation?'),
    idea: pick(language, 'ISR, hybride Einflussnahme, Resilienz und Eskalationskontrolle erweitern die klassischen Perspektiven.', 'ISR, hybrid influence, resilience, and escalation control extend the classical perspectives.'),
  },
})

export const getHelpChapters = (language: Language): HelpChapter[] => [
  {
    id: 'mission',
    navLabel: pick(language, 'Schnellstart & Spielziel', 'Quick start & objective'),
    eyebrow: pick(language, 'SCHNELL NACHSCHLAGEN', 'QUICK REFERENCE'),
    title: pick(language, 'Spielziel und erste Orientierung', 'Objective and first orientation'),
    subtitle: pick(language, 'Baue regionale Projektion auf und halte mindestens eine wirtschaftlich starke SLOC nutzbar.', 'Build regional Projection and keep at least one economically strong SLOC usable.'),
    strategists: ['mahan'],
  },
  {
    id: 'turn',
    navLabel: pick(language, 'Rundenablauf & Bedienung', 'Round flow & controls'),
    eyebrow: pick(language, 'RUNDENABLAUF', 'ROUND FLOW'),
    title: pick(language, 'Karten spielen und Zug beenden', 'Play cards and end the turn'),
    subtitle: pick(language, 'Jede Runde besteht aus zwei Zügen mit je 3 AP und einer anschließenden gemeinsamen Wertung.', 'Each round consists of two turns with 3 AP each, followed by a shared evaluation.'),
    strategists: ['mahan', 'corbett'],
  },
  {
    id: 'map',
    navLabel: pick(language, 'Seekarte & Räume', 'Chart & regions'),
    eyebrow: pick(language, 'SEEGEOGRAFIE', 'MARITIME GEOGRAPHY'),
    title: pick(language, 'Räume, Verbindungen und Perspektiven', 'Regions, connections, and perspectives'),
    subtitle: pick(language, 'Räume werden nicht besetzt; ihre Nutzbarkeit ergibt sich für jede Koalition aus dem Projektionsvergleich.', 'Regions are not occupied; their usability follows from the Projection comparison for each coalition.'),
    strategists: ['corbett', 'wegener'],
  },
  {
    id: 'projection',
    navLabel: pick(language, 'Ressourcen & Projektion', 'Resources & Projection'),
    eyebrow: pick(language, 'REGIONALE STÄRKE', 'REGIONAL STRENGTH'),
    title: pick(language, 'Projektion berechnen', 'Calculate Projection'),
    subtitle: pick(language, 'Präsenz, Lagebild, Zugang und Logistik werden je Region und Seite addiert.', 'Presence, Awareness, Access, and Logistics are added for each region and side.'),
    strategists: ['mahan', 'corbett', 'wegener', 'modern'],
  },
  {
    id: 'slocs',
    navLabel: pick(language, 'Seewege & Ertrag', 'Sea lines & yield'),
    eyebrow: pick(language, 'SLOC-REFERENZ', 'SLOC REFERENCE'),
    title: pick(language, 'SLOCs prüfen und Ertrag berechnen', 'Check SLOCs and calculate Yield'),
    subtitle: pick(language, 'Prüfe zuerst die Schließungsbedingungen und berechne danach den Ertrag beider eigenen Routen.', 'Check closure conditions first, then calculate the Yield of both friendly routes.'),
    strategists: ['corbett', 'wegener', 'mahan'],
  },
  {
    id: 'cards',
    navLabel: pick(language, 'Kartenreferenz', 'Card reference'),
    eyebrow: pick(language, 'ALLE ELF KARTEN', 'ALL ELEVEN CARDS'),
    title: pick(language, 'Kosten, Ziele und Voraussetzungen', 'Costs, targets, and requirements'),
    subtitle: pick(language, 'Die Karten stehen in derselben Reihenfolge wie im Regelkern und zeigen alle Einschränkungen auf einen Blick.', 'Cards appear in rule-engine order and show every restriction at a glance.'),
    strategists: ['mahan', 'corbett', 'wegener', 'modern'],
  },
  {
    id: 'crisis',
    navLabel: pick(language, 'Eskalation & Staatsformen', 'Escalation & governments'),
    eyebrow: pick(language, 'ESKALATION · STAATSFORM · GRAUZONE', 'ESCALATION · GOVERNMENT · GREY ZONE'),
    title: pick(language, 'Boni, Krisenkosten und verdeckte Aktionen', 'Bonuses, crisis costs, and covert actions'),
    subtitle: pick(language, 'Staatsformen besitzen unterschiedliche Vorteilskorridore; offene und verdeckte Aktionen behandeln Eskalation verschieden.', 'Governments have different advantage windows; open and covert actions handle Escalation differently.'),
    strategists: ['mahan', 'corbett', 'wegener', 'modern'],
  },
  {
    id: 'leadership',
    navLabel: pick(language, 'Spielende & Führung', 'End game & leadership'),
    eyebrow: pick(language, 'ABSCHLUSSREFERENZ', 'END-GAME REFERENCE'),
    title: pick(language, 'Sieg, Tie-Breaker und Führungswertung', 'Victory, tie-breakers, and leadership rating'),
    subtitle: pick(language, 'Der wirtschaftliche Sieger und die Qualität der Führung werden getrennt bestimmt.', 'The economic victor and the quality of leadership are determined separately.'),
    strategists: ['mahan', 'corbett', 'wegener', 'modern'],
  },
]

export const HELP_STRATEGIC_DISCLAIMER = (language: Language) => pick(
  language,
  'Strategenhinweise erklären knapp den Designhintergrund. Verbindlich für das Spiel sind die jeweils hervorgehobenen Regeln und Zahlen.',
  'Strategist notes briefly explain the design background. The highlighted rules and numbers are authoritative for play.',
)

export const isCompleteHelpCardSet = () => {
  const unique = new Set(HELP_CARD_IDS)
  return unique.size === CARD_ORDER.length && CARD_ORDER.every((cardId) => unique.has(cardId))
}

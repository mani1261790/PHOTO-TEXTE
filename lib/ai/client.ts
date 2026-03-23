import OpenAI from 'openai';

import { CEFRLevel, GrammaticalGender } from '@/lib/types';

type Constraints = {
  cefrLevel: CEFRLevel;
  grammaticalGender: GrammaticalGender;
  politenessPref?: string | null;
};

type LearningNotePair = {
  draftFr: string;
  finalFr: string;
  highlights?: HighlightSuggestion;
};

type LearningNoteOptions = {
  language: 'ja' | 'fr';
  unknownWords?: string[];
  maxNotes?: number;
};

export type HighlightSuggestion = {
  knownWords: string[];
  unknownWords: string[];
  grammarWords: string[];
};

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return null;
  }
  return new OpenAI({ apiKey: key });
}

function parseOutput(outputText: string): string {
  return outputText.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
}

function uniqueNormalized(words: string[]): string[] {
  return [...new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean))];
}

function parseJsonObject<T>(outputText: string): T | null {
  const text = parseOutput(outputText);
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function translateFrToJa(draftFr: string): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    return `【JP要約】${draftFr}`;
  }

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    store: false,
    input: [
      {
        role: 'system',
        content:
          'Translate French text to natural Japanese for a student assignment. Return Japanese only.'
      },
      {
        role: 'user',
        content: draftFr
      }
    ]
  });

  return parseOutput(response.output_text || '');
}

function buildRewriteInstruction(constraints: Constraints): string {
  const politeness = constraints.politenessPref
    ? `Politeness preference: ${constraints.politenessPref}.`
    : 'No explicit politeness preference.';

  return [
    'Rewrite Japanese intent into final French.',
    `Target CEFR: ${constraints.cefrLevel}.`,
    `Grammatical gender: ${constraints.grammaticalGender}.`,
    politeness,
    'Keep meaning accurate while adapting vocabulary and syntax for CEFR target.',
    'Return French only.'
  ].join(' ');
}

export async function rewriteJaToFr(
  jpIntent: string,
  constraints: Constraints
): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    return `[Final FR ${constraints.cefrLevel}] ${jpIntent}`;
  }

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    store: false,
    input: [
      {
        role: 'system',
        content: buildRewriteInstruction(constraints)
      },
      {
        role: 'user',
        content: jpIntent
      }
    ]
  });

  return parseOutput(response.output_text || '');
}

function buildLearningNotesInstruction(
  constraints: Constraints,
  options: LearningNoteOptions
): string {
  const politeness = constraints.politenessPref
    ? `Politeness preference: ${constraints.politenessPref}.`
    : 'No explicit politeness preference.';

  const lang = options.language === 'fr' ? 'French' : 'Japanese';
  return [
    'You are a language tutor creating learning notes for a student.',
    `Target CEFR: ${constraints.cefrLevel}.`,
    `Grammatical gender: ${constraints.grammaticalGender}.`,
    politeness,
    `Write the notes in ${lang}.`,
    'Base the notes only on the highlighted learning targets provided for each photo.',
    'Ignore corrections that are not included in the highlighted targets.',
    'Focus on grammar corrections, vocabulary/expressions, and key fixes between draft and final.',
    'Keep each bullet concise (one line).',
    'Return 4-8 bullet lines, no numbering, no extra commentary.'
  ].join(' ');
}

function parseLearningNotes(outputText: string): string[] {
  return parseOutput(outputText)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.]+\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function generateLearningNotes(
  pairs: LearningNotePair[],
  constraints: Constraints,
  options: LearningNoteOptions
): Promise<string[]> {
  const maxNotes = options.maxNotes ?? 8;
  const cleanPairs = pairs
    .map((p) => ({
      draftFr: (p.draftFr ?? '').trim(),
      finalFr: (p.finalFr ?? '').trim(),
      highlights: p.highlights ?? { grammarWords: [], knownWords: [], unknownWords: [] }
    }))
    .filter((p) => p.draftFr && p.finalFr);

  if (!cleanPairs.length) {
    return [];
  }

  const client = getOpenAIClient();
  if (!client) {
    const fallback = cleanPairs.flatMap((p) => {
      const grammar = p.highlights.grammarWords.map((word) => `文法: ${word}`);
      const known = p.highlights.knownWords.map((word) => `語彙修正: ${word}`);
      const unknown = p.highlights.unknownWords.map((word) => `覚える語: ${word}`);
      return [...grammar, ...known, ...unknown];
    }).slice(0, maxNotes);
    if (!fallback.length) {
      return [];
    }
    const prefix = options.language === 'fr' ? 'Note' : '学び';
    return fallback.map((line) => `【${prefix}】${line}`);
  }

  const unknownWords = (options.unknownWords ?? []).slice(0, 12);
  const pairsText = cleanPairs
    .map(
      (p, idx) =>
        [
          `Photo ${idx + 1}`,
          `Draft: ${p.draftFr}`,
          `Final: ${p.finalFr}`,
          `Highlighted grammar targets: ${p.highlights.grammarWords.join(', ') || '(none)'}`,
          `Highlighted known-word corrections: ${p.highlights.knownWords.join(', ') || '(none)'}`,
          `Highlighted unknown-word targets: ${p.highlights.unknownWords.join(', ') || '(none)'}`,
        ].join('\n')
    )
    .join('\n\n');

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    store: false,
    input: [
      {
        role: 'system',
        content: buildLearningNotesInstruction(constraints, options)
      },
      {
        role: 'user',
        content: [
          'Generate learning notes from the following data.',
          unknownWords.length
            ? `Unknown words to prioritize: ${unknownWords.join(', ')}`
            : 'Unknown words to prioritize: (none)',
          `Max bullets: ${maxNotes}`,
          pairsText
        ].join('\n')
      }
    ]
  });

  return parseLearningNotes(response.output_text || '').slice(0, maxNotes);
}

export async function suggestHighlightColors(params: {
  draftFr: string;
  finalFr: string;
  cefrLevel: CEFRLevel;
  draftWords: string[];
  finalWords: string[];
  changedWords: string[];
  baseline: HighlightSuggestion;
}): Promise<HighlightSuggestion | null> {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  const finalWords = uniqueNormalized(params.finalWords);
  if (!finalWords.length) {
    return null;
  }

  const allowed = new Set(finalWords);
  const changedWords = uniqueNormalized(params.changedWords).filter((word) => allowed.has(word));
  const baseline = {
    grammarWords: uniqueNormalized(params.baseline.grammarWords).filter((word) => allowed.has(word)),
    knownWords: uniqueNormalized(params.baseline.knownWords).filter((word) => allowed.has(word)),
    unknownWords: uniqueNormalized(params.baseline.unknownWords).filter((word) => allowed.has(word))
  };

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    store: false,
    input: [
      {
        role: 'system',
        content: [
          'You are classifying words in a final French sentence for pre-filled correction highlights.',
          'Return strict JSON only with keys grammarWords, knownWords, unknownWords.',
          'Each value must be an array of lowercase normalized French words chosen only from the supplied finalWords list.',
          'Do not include the same word in multiple arrays.',
          'Only classify words that are part of a correction in finalFr, with strong preference for changedWords.',
          'Use draftFr and draftWords as evidence of what the learner already knows or already tried to use.',
          'If the learner already uses a word, root, or structure in draftFr, do not mark it unknown just because it is above target CEFR.',
          'grammarWords: corrected words whose change is mainly grammatical glue, agreement, article, pronoun, preposition, auxiliary, inflection, or syntax support, and is still worth review for this learner.',
          'knownWords: corrected lexical words the learner likely basically knows already, but used inaccurately.',
          'unknownWords: corrected lexical words that are genuinely good new learning targets for this learner.',
          'If a correction is already mastered, stylistic only, or not worth highlighting, leave it out of all arrays.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          cefrLevel: params.cefrLevel,
          draftFr: params.draftFr,
          finalFr: params.finalFr,
          draftWords: uniqueNormalized(params.draftWords),
          finalWords,
          changedWords,
          baseline
        })
      }
    ]
  });

  const parsed = parseJsonObject<Partial<HighlightSuggestion>>(response.output_text || '');
  if (!parsed) {
    return null;
  }

  const unknownWords = uniqueNormalized(parsed.unknownWords ?? []).filter((word) => allowed.has(word));
  const grammarBlocked = new Set(unknownWords);
  const grammarWords = uniqueNormalized(parsed.grammarWords ?? []).filter(
    (word) => allowed.has(word) && !grammarBlocked.has(word)
  );
  const knownBlocked = new Set([...unknownWords, ...grammarWords]);
  const knownWords = uniqueNormalized(parsed.knownWords ?? []).filter(
    (word) => allowed.has(word) && !knownBlocked.has(word)
  );

  return {
    grammarWords,
    knownWords,
    unknownWords
  };
}

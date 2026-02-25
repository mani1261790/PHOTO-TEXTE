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
};

type LearningNoteOptions = {
  language: 'ja' | 'fr';
  unknownWords?: string[];
  maxNotes?: number;
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
      finalFr: (p.finalFr ?? '').trim()
    }))
    .filter((p) => p.draftFr && p.finalFr);

  if (!cleanPairs.length) {
    return [];
  }

  const client = getOpenAIClient();
  if (!client) {
    const fallback = cleanPairs
      .map((p) => p.finalFr)
      .filter(Boolean)
      .slice(0, maxNotes);
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
        `Photo ${idx + 1}\nDraft: ${p.draftFr}\nFinal: ${p.finalFr}`
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

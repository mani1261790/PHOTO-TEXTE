import { getAppEnv } from '@/lib/cloudflare/context';
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
  maxNotes?: number;
};

type OpenAIConfig = {
  apiKey: string;
  model: string;
};

type OpenAIResponse = {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    code?: string;
    type?: string;
  };
};

async function getOpenAIConfig(): Promise<OpenAIConfig | null> {
  try {
    const env = await getAppEnv();
    if (env.OPENAI_API_KEY) {
      return {
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL ?? 'gpt-4o-mini'
      };
    }
  } catch {
    // Local Next.js and unit tests do not have a Cloudflare request context.
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
  };
}

async function createOpenAIResponse(
  system: string,
  user: string
): Promise<string | null> {
  const config = await getOpenAIConfig();
  if (!config) return null;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      store: false,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  const payload = await response.json() as OpenAIResponse;
  if (!response.ok) {
    const reason = payload.error?.code ?? payload.error?.type ?? 'unknown_error';
    throw new Error(`OpenAI request failed (${response.status}: ${reason})`);
  }

  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text ?? '')
    .join('');
}

function parseOutput(outputText: string): string {
  return outputText.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
}

export async function translateFrToJa(draftFr: string): Promise<string> {
  const output = await createOpenAIResponse(
    'Translate French text to natural Japanese for a student assignment. Return Japanese only.',
    draftFr
  );
  if (output === null) {
    return `【JP要約】${draftFr}`;
  }
  return parseOutput(output);
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
  const output = await createOpenAIResponse(
    buildRewriteInstruction(constraints),
    jpIntent
  );
  if (output === null) {
    return `[Final FR ${constraints.cefrLevel}] ${jpIntent}`;
  }
  return parseOutput(output);
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
    'Compare the draft and final French for each photo.',
    'Focus on useful grammar corrections, vocabulary/expressions, and key fixes between draft and final.',
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

  const pairsText = cleanPairs
    .map(
      (p, idx) =>
        [
          `Photo ${idx + 1}`,
          `Draft: ${p.draftFr}`,
          `Final: ${p.finalFr}`,
        ].join('\n')
    )
    .join('\n\n');

  const output = await createOpenAIResponse(
    buildLearningNotesInstruction(constraints, options),
    [
      'Generate learning notes from the following data.',
      `Max bullets: ${maxNotes}`,
      pairsText
    ].join('\n')
  );
  if (output === null) return [];
  return parseLearningNotes(output).slice(0, maxNotes);
}

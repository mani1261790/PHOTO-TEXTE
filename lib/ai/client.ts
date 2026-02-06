import OpenAI from 'openai';

import { CEFRLevel, GrammaticalGender } from '@/lib/types';

type Constraints = {
  cefrLevel: CEFRLevel;
  grammaticalGender: GrammaticalGender;
  politenessPref?: string | null;
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

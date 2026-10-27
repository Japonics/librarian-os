import type { LibNode, Question } from '../../shared/types';
import { buildQuestionPrompt, parseQuestions, QUESTION_SYSTEM_PROMPT, type AIProvider } from './provider';

/** Ask the provider for new questions about one note and return validated proposals. */
export async function proposeQuestions(provider: AIProvider, node: LibNode, markdown: string, count: number): Promise<Question[]> {
  const raw = await provider.complete(QUESTION_SYSTEM_PROMPT, buildQuestionPrompt({ title: node.title, markdown, existing: node.questions, count }));
  const questions = parseQuestions(raw, node.headings, node.questions, count);
  if (questions.length === 0) throw new Error('The model returned no usable questions.');
  return questions;
}

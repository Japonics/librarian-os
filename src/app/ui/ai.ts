import type { LibNode, Question } from '../../shared/types';
import { proposeQuestions, saveQuestions } from '../api';
import { h, toast } from '../dom';
import { state } from '../state';
import { getChoice, readyProviders } from '../store/ai';

/** The panel at the end of a note that asks the server for practice questions. Returns undefined when no provider is usable. */
export function aiPanel(node: LibNode): HTMLElement | undefined {
  if (readyProviders().length === 0) return undefined;
  const choice = getChoice();
  const label = state.app.ai.providers.find((p) => p.id === choice.provider)?.label ?? choice.provider;
  const result = h('div');
  const count = h('input', { type: 'number', min: 1, max: state.app.ai.maxQuestions, value: 5, style: 'width:4rem', 'aria-label': 'Number of questions' });
  const button = h('button', { class: 'btn primary', type: 'button' }, 'Generate questions');

  const accept = async (q: Question, row: HTMLElement): Promise<void> => {
    try {
      const next = [...node.questions, { ...q, reviewed: true }];
      await saveQuestions(state.repoId, node.id, next);
      node.questions = next;
      row.remove();
      toast('Question saved to the sidecar file');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save');
    }
  };

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Working...';
    result.replaceChildren();
    try {
      const { questions } = await proposeQuestions(state.repoId, node.id, Number(count.value) || 5, getChoice());
      for (const q of questions) {
        const row = h('div', { class: 'proposal' }, h('div', { class: 'q' }, q.q), h('div', { class: 'a' }, q.a), h('span', { class: 'chip' }, q.type));
        row.append(' ', h('button', { class: 'btn', type: 'button', onclick: () => void accept(q, row) }, 'Keep'), ' ', h('button', { class: 'btn ghost', type: 'button', onclick: () => row.remove() }, 'Discard'));
        result.append(row);
      }
    } catch (e) {
      result.append(h('p', { class: 'error' }, e instanceof Error ? e.message : 'Request failed'));
    } finally {
      button.disabled = false;
      button.textContent = 'Generate questions';
    }
  });

  return h('section', { class: 'ai-panel', 'aria-label': 'Question generator' }, h('h3', null, 'Practice questions from this note'),
    h('p', { class: 'rel-note' }, `Proposals come from ${label}, model ${choice.model}. Change it in `, h('a', { href: '/settings' }, 'Settings'), `. Nothing is saved until you press Keep, and accepted questions are written to this note's sidecar file.`),
    h('div', null, count, ' ', button), result);
}

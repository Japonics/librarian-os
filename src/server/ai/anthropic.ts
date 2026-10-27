import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider } from './provider';

/** Calls the Messages API. Credentials come from the environment (see librarian.config.json, ai.apiKeyEnv). */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    private readonly model: string,
    apiKey: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(system: string, user: string): Promise<string> {
    try {
      // Server-side fallback re-runs a request the safety classifiers decline on a recommended model.
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        messages: [{ role: 'user', content: user }],
      } as Anthropic.Beta.MessageCreateParamsNonStreaming);
      if (response.stop_reason === 'refusal') {
        throw new Error(`The model declined the request (${response.stop_details?.category ?? 'no category'}).`);
      }
      if (response.stop_reason === 'max_tokens') throw new Error('The answer was cut off. Ask for fewer questions.');
      return response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new Error('The API key was rejected.');
      if (error instanceof Anthropic.RateLimitError) throw new Error('Rate limited. Try again later.');
      if (error instanceof Anthropic.BadRequestError) throw new Error(`Bad request: ${error.message}`);
      if (error instanceof Anthropic.APIError) throw new Error(`API error ${error.status ?? ''}: ${error.message}`);
      throw error;
    }
  }
}

import OpenAI from 'openai';
import type { AIProvider } from './provider';

/** Calls the OpenAI Responses API. */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(
    private readonly model: string,
    apiKey: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(system: string, user: string): Promise<string> {
    try {
      const res = await this.client.responses.create({ model: this.model, instructions: system, input: user, max_output_tokens: 16000 });
      if (res.status === 'incomplete') throw new Error(`The answer is incomplete (${res.incomplete_details?.reason ?? 'unknown reason'}). Ask for fewer questions.`);
      return res.output_text;
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) throw new Error('The API key was rejected.');
      if (error instanceof OpenAI.RateLimitError) throw new Error('Rate limited. Try again later.');
      if (error instanceof OpenAI.BadRequestError) throw new Error(`Bad request: ${error.message}`);
      if (error instanceof OpenAI.APIError) throw new Error(`API error ${error.status ?? ''}: ${error.message}`);
      throw error;
    }
  }
}

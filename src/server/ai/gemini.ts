import { ApiError, GoogleGenAI } from '@google/genai';
import type { AIProvider } from './provider';

/** Calls the Gemini API through generateContent. */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private readonly ai: GoogleGenAI;

  constructor(
    private readonly model: string,
    apiKey: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async complete(system: string, user: string): Promise<string> {
    try {
      const res = await this.ai.models.generateContent({ model: this.model, contents: user, config: { systemInstruction: system, maxOutputTokens: 16000 } });
      if (res.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('The answer was cut off. Ask for fewer questions.');
      return res.text ?? '';
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401 || error.status === 403) throw new Error('The API key was rejected.');
        if (error.status === 429) throw new Error('Rate limited. Try again later.');
        throw new Error(`API error ${error.status}: ${error.message}`);
      }
      throw error;
    }
  }
}

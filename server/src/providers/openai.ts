import type { TranslationProvider } from './index';

const DEFAULT_SYSTEM_PROMPT_TEXT =
  'You are a professional translator. Translate the following text from {sourceLang} to {targetLang}. ' +
  'Return ONLY the translated text. Do NOT wrap in code blocks or markdown. ' +
  'Do NOT add backticks. Do NOT add explanations. If the text is very short, still translate it.';

const DEFAULT_SYSTEM_PROMPT_HTML =
  'You are a professional translator. Translate the HTML content from {sourceLang} to {targetLang}. ' +
  'Preserve all HTML tags exactly as-is. Return ONLY the translated HTML. ' +
  'Do NOT wrap in code blocks or markdown. Do NOT add backticks. Do NOT add explanations.';

interface OpenAIConfig {
  apiKey: string;
  model: string;
  temperature: number;
  systemPromptText: string;
  systemPromptHtml: string;
}

export function createOpenAIProvider(config: OpenAIConfig): TranslationProvider {
  const { OpenAI } = require('openai');
  const client = new OpenAI({ apiKey: config.apiKey });

  const model = config.model || 'gpt-4o-mini';
  const temperature = config.temperature ?? 0.1;

  const textPromptTemplate = config.systemPromptText || DEFAULT_SYSTEM_PROMPT_TEXT;
  const htmlPromptTemplate = config.systemPromptHtml || DEFAULT_SYSTEM_PROMPT_HTML;

  const translate = async (
    text: string,
    sourceLang: string,
    targetLang: string,
    isHtml = false,
  ): Promise<string> => {
    if (!text || text.trim() === '') return text;

    const template = isHtml ? htmlPromptTemplate : textPromptTemplate;
    const systemPrompt = template
      .replace(/\{sourceLang\}/g, sourceLang)
      .replace(/\{targetLang\}/g, targetLang);

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature,
    });

    let result = response.choices[0]?.message?.content?.trim() ?? text;
    // Strip code block wrappers that GPT sometimes adds
    result = result.replace(/^```(?:html|text|markdown)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    return result;
  };

  return {
    translateText: (text, src, tgt) => translate(text, src, tgt, false),
    translateHtml: (html, src, tgt) => translate(html, src, tgt, true),
  };
}

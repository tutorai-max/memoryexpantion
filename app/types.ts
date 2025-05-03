export type Project  = { id: number; name: string };
export type Session  = { id: number; name: string; project_id: number };
export type Message  = { id: number; role: 'user' | 'assistant'; content: string };
export type Provider = 'gemini' | 'openai' | 'groq' | 'anthropic';
export type ApiCfg   = { provider: Provider; apiKey: string };

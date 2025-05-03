import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
  const { messages, provider, model, apiKey } = await req.json();

  /* --- Gemini --- */
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages.map((m: any) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        })),
      }),
    });
    const j = await r.json();
    return NextResponse.json({
      reply: j.candidates?.[0]?.content?.parts?.[0]?.text ?? '[gemini error]',
    });
  }

  /* --- OpenAI --- */
  if (provider === 'openai') {
    const openai = new OpenAI({ apiKey });
    const chat = await openai.chat.completions.create({ model, messages });
    return NextResponse.json({ reply: chat.choices[0].message.content });
  }

  /* --- Groq --- */
  if (provider === 'groq') {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages }),
    });
    const j = await r.json();
    return NextResponse.json({ reply: j.choices?.[0]?.message?.content ?? '[groq error]' });
  }

  /* --- Anthropic --- */
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
    }),
  });
  const j = await r.json();
  return NextResponse.json({ reply: j.content?.[0]?.text ?? '[anthropic error]' });
}

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_AIML_API_KEY || process.env.AIML_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { aiText } = await request.json();

    if (!aiText || typeof aiText !== 'string') {
      return NextResponse.json({ error: 'Valid aiText is required' }, { status: 400 });
    }

    const prompt = `
You are a professional humanization assistant. Your job is to transform AI-generated text into natural, human-like writing with the following qualities:

- Use varied sentence lengths and structures
- Add subtle imperfections (e.g., contractions, mild digressions)
- Avoid robotic repetition and overuse of transitional phrases
- Sound conversational, authentic, and engaging
- Keep the original meaning and key facts intact

AI Text:
${aiText}

Humanized Version:
`.trim();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // or 'gpt-3.5-turbo', 'gpt-4-turbo'
      messages: [
        {
          role: 'system',
          content: 'You are a skilled writer who rewrites AI text to sound like a thoughtful human.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    });

    const humanizedText = completion.choices[0]?.message?.content?.trim();

    if (!humanizedText) {
      throw new Error('No response from AI');
    }

    return NextResponse.json({ message: humanizedText });
  } catch (error: any) {
    console.error('Humanize API Error:', error);
    return NextResponse.json(
      { error: 'Failed to humanize text', details: error.message },
      { status: 500 }
    );
  }
}
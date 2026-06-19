type ToneClass = 'neutral' | 'warm' | 'urgent'

export async function classifyTone(content: string): Promise<ToneClass> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return 'neutral'

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 10,
        messages: [
          {
            role: 'system',
            content:
              'Classify the tone of the following message as exactly one of: neutral, warm, urgent. Reply with only the single word.',
          },
          { role: 'user', content },
        ],
      }),
    })

    if (!res.ok) return 'neutral'

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const tone = data.choices?.[0]?.message?.content?.trim().toLowerCase()
    if (tone === 'warm' || tone === 'urgent') return tone
    return 'neutral'
  } catch {
    return 'neutral'
  }
}

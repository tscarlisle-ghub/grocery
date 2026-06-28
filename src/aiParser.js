// aiParser.js — calls Anthropic API to parse grocery text
// Falls back to local parser if key not configured or call fails

import { parseGroceryText } from './parser.js'

const API_KEY = import.meta.env.VITE_ANTHROPIC_KEY

export async function parseWithAI(text) {
  if (!API_KEY) {
    console.info('No VITE_ANTHROPIC_KEY set — using local parser')
    return parseGroceryText(text)
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-allow-browser': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: `Extract every grocery item from the user's text. Return ONLY a valid JSON array, nothing else. Each element: {"name":"string","qty":"string","note":"string"}. Infer quantities from context (default "1"). note is brand/size/variety or empty string. No markdown fences, no explanation.`,
        messages: [{ role: 'user', content: text }],
      }),
    })

    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()
    const raw = data.content?.find(b => b.type === 'text')?.text ?? '[]'
    return JSON.parse(raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim())
  } catch (err) {
    console.warn('AI parse failed, falling back to local parser:', err)
    return parseGroceryText(text)
  }
}

export async function getSuggestionsAI(query) {
  if (!API_KEY) return []

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-allow-browser': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: `Grocery autocomplete for Publix. Return ONLY a JSON array of up to 6 matching items. Each: {"name":"string","qty":"string","note":"string"}. qty examples: "1","2","1 lb","1 bunch","1 dozen","32 oz","6 pack". note is optional brand/variety or "". Raw JSON only.`,
        messages: [{ role: 'user', content: `Items matching: "${query}"` }],
      }),
    })

    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()
    const raw = data.content?.find(b => b.type === 'text')?.text ?? '[]'
    return JSON.parse(raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim())
  } catch {
    return []
  }
}

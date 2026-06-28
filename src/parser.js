// parseGroceryText: extract grocery items from any text
// handles recipes, ingredient lists, casual texts, comma lists

export function parseGroceryText(raw) {
  const lines = raw.split(/\n|;/).map(l => l.trim()).filter(Boolean)
  const results = []
  const seen = new Set()

  const QTY_RE = /^((?:\d+[\s\-\/]*(?:\d+\/\d+|\d*\.?\d+)?|[aA]n?|[sS]ome|[aA]\s+few|[aA]\s+couple(?:\s+of)?|[aA]\s+bunch(?:\s+of)?|[aA]\s+dozen)\s*(?:lbs?|pounds?|oz|ounces?|g|grams?|kg|ml|liters?|litres?|cups?|tbsp|tablespoons?|tsp|teaspoons?|cans?|jars?|boxes?|bags?|bottles?|bunches?|heads?|cloves?|slices?|pieces?|packs?|packages?|dozen|pints?|quarts?|gallons?)?)\s*/i

  const SKIP = new Set(['and','or','the','a','an','some','more','fresh','good','nice','maybe','also','plus','extra','few','couple','bunch','package','container','handful','bit','little','lot'])

  const FILLER_RE = /^(?:(?:can\s+you\s+)?(?:please\s+)?(?:grab|get|pick\s+up|buy|snag|swing\s+by\s+and\s+get)|we\s+(?:need|want|are\s+out\s+of|could\s+use)|(?:also\s+)?(?:don'?t\s+forget|remember\s+to\s+get)|i(?:'m|\s+am)\s+(?:out\s+of|low\s+on)|we'?re\s+(?:out\s+of|low\s+on)|(?:need|want)\s+(?:to\s+(?:get|buy))?)\s*/i

  for (let line of lines) {
    line = line.replace(/^[\-\*•–—▪◦]+\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim()
    if (!line) continue
    line = line.replace(FILLER_RE, '').trim()

    const parts = line.split(/,(?:\s+and\s+|\s+)?/)

    for (let part of parts) {
      part = part.trim().replace(/^and\s+/i, '').trim()
      if (!part) continue
      part = part.replace(/\s+(?:for\s+\w+|from\s+\w+|if\s+possible|please|ok\?|🙏|👍|🛒).*$/i, '').trim()

      let qty = '1'
      const qtyMatch = part.match(QTY_RE)
      if (qtyMatch) {
        qty = qtyMatch[1].trim()
        part = part.slice(qtyMatch[0].length).trim()
      }

      part = part.replace(/^(?:the|a|an|some|that\s+(?:good\s+)?|my\s+)\s+/i, '').trim()
      part = part.replace(/[.!?]+$/, '').trim()

      if (!part || part.length < 2) continue
      const lower = part.toLowerCase()
      if (SKIP.has(lower)) continue
      if (seen.has(lower)) continue
      seen.add(lower)

      const name = part.charAt(0).toUpperCase() + part.slice(1)
      results.push({ name, qty, note: '' })
    }
  }

  return results
}

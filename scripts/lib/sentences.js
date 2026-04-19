export const ABBREVS = /(?:St|Mr|Mrs|Ms|Dr|Jr|Sr|vs|Gen|Gov|Sgt|Col|Cpl|Pvt|Prof|Rev|Rep|Sen|Inc|Ltd|Corp|Dept|Univ|Est|approx|No|(?<![A-Z])[A-Z])\.\s+/g

export function splitSentences(text) {
  const masked = text.trim().replace(ABBREVS, m => m.replace('. ', '.\x00'))
  return masked.split(/(?<=[.!?])\s+(?=[\p{Lu}\[])/u).map(s => s.replace(/\.\x00/g, '. ')).filter(Boolean)
}

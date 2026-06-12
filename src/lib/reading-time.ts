const CJK = /[一-鿿㐀-䶿]/g;

export function countWords(text: string): number {
  const stripped = text.replace(/```[\s\S]*?```/g, '');
  const cjk = (stripped.match(CJK) ?? []).length;
  const latin = (stripped.replace(CJK, ' ').match(/[A-Za-z0-9_]+/g) ?? []).length;
  return cjk + latin;
}

export function readingTime(text: string): { words: number; minutes: number } {
  const words = countWords(text);
  return { words, minutes: Math.max(1, Math.round(words / 350)) };
}

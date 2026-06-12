export interface NumberableLike {
  id: string;
  data: { date: Date; number?: number | undefined };
}

export function postNumber(post: NumberableLike, all: NumberableLike[]): number {
  if (post.data.number != null) return post.data.number;
  const sorted = [...all].sort((a, b) => a.data.date.getTime() - b.data.date.getTime());
  return sorted.findIndex((p) => p.id === post.id) + 1;
}

export interface RelatableLike {
  id: string;
  section: string;
  data: { tags: string[] | undefined; date: Date };
}

export function relatedPosts<T extends RelatableLike>(current: T, all: T[], n = 3): T[] {
  const curTags = current.data.tags ?? [];
  return all
    .filter((p) => p.id !== current.id)
    .map((p) => {
      const shared = (p.data.tags ?? []).filter((t) => curTags.includes(t)).length;
      const score = shared * 2 + (p.section === current.section ? 1 : 0);
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.p.data.date.getTime() - a.p.data.date.getTime())
    .slice(0, n)
    .map((x) => x.p);
}

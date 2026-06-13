// 标签体系的单一事实源（single source of truth）。
// 命名空间白名单、命名规范、封闭枚举、分面数量上限、受控词表（同义词）、
// 以及标签说明（tag-wiki）。构建期校验、`npm run lint:tags` 与标签页展示均依赖本文件。
// 设计依据见《note-agent Tag System Design》。

export interface NamespaceDef {
  label: string;
  description: string;
  /** 每篇文章该命名空间下标签数量上限（不设则不限） */
  max?: number;
  /** 若给定则为封闭枚举：值必须取自此列表 */
  values?: readonly string[];
}

export const NAMESPACES = {
  subject: {
    label: 'Subject',
    description: '文章关于的核心对象：真实世界的人 / 公司 / 产品 / 技术实体。保留原始大小写或 PascalCase。',
    max: 2,
  },
  topic: {
    label: 'Topic',
    description: '涉及的概念 / 方法论 / 议题。kebab-case。',
  },
  type: {
    label: 'Type',
    description: '文章体裁，取自封闭枚举。',
    values: ['retrospective', 'case-study', 'methodology', 'study-note', 'design-doc', 'news-summary', 'meta', 'note'],
  },
  project: {
    label: 'Project',
    description: '所属工程项目，匹配 repo 名。kebab-case。',
    max: 1,
  },
  series: {
    label: 'Series',
    description: '所属连载系列，把多篇文章串成一条阅读路径。kebab-case。',
    max: 1,
  },
  source: {
    label: 'Source',
    description: '内容的导入来源 / 渠道。kebab-case。',
    max: 1,
  },
} as const satisfies Record<string, NamespaceDef>;

export type Namespace = keyof typeof NAMESPACES;

/** 标签页与文章页里命名空间的展示顺序 */
export const NAMESPACE_ORDER: Namespace[] = ['subject', 'topic', 'type', 'project', 'series', 'source'];

/** 受控词表：历史写法 / 同义词 → 规范标签。构建期会要求改用规范写法。 */
export const SYNONYMS: Record<string, string> = {
  llm: 'subject/LLM',
  rag: 'subject/RAG',
  ai: 'subject/AI',
  meta: 'type/meta',
  'learning-note': 'type/study-note',
  'design-doc': 'type/design-doc',
};

/** 标签说明（tag-wiki）：渲染在 /tags/<tag>/ 顶部。键为完整标签。按需补充。 */
export const TAG_DESCRIPTIONS: Record<string, string> = {
  'type/retrospective': '对一次完整经历的复盘：发生了什么、根因为何、学到了什么。',
  'type/case-study': '围绕一个具体案例的深入剖析。',
  'type/methodology': '可复用的方法论或工作流提炼。',
  'type/study-note': '阅读 / 学习他人材料后的精读笔记。',
  'type/design-doc': '某个系统或功能的设计文档。',
  'type/news-summary': '对一则资讯的摘要与点评。',
  'type/meta': '关于本站本身的说明性文章。',
};

// 值的命名规范：字母 / 数字，以连字符分段；不含空格、下划线、中文。
// 同时允许 PascalCase 专名（EEPROM、Cortex-M0、I2C）与 kebab-case 概念（root-cause-analysis）。
const VALUE_RE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

const nsDef = (ns: string): NamespaceDef | undefined => (NAMESPACES as Record<string, NamespaceDef>)[ns];

export function parseTag(tag: string): { ns: string; value: string } {
  const i = tag.indexOf('/');
  return i >= 0 ? { ns: tag.slice(0, i), value: tag.slice(i + 1) } : { ns: '', value: tag };
}

export function namespaceLabel(ns: string): string {
  return nsDef(ns)?.label ?? ns;
}

export function tagDescription(tag: string): string | undefined {
  return TAG_DESCRIPTIONS[tag];
}

/** 校验一篇文章的标签集合，返回人类可读的错误信息（空数组 = 合规）。 */
export function validateTags(tags: string[]): string[] {
  const errors: string[] = [];
  const perNs = new Map<string, number>();
  const seen = new Set<string>();

  for (const raw of tags) {
    if (seen.has(raw)) errors.push(`标签「${raw}」重复`);
    seen.add(raw);

    if (SYNONYMS[raw]) {
      errors.push(`「${raw}」是历史写法，请改用规范标签「${SYNONYMS[raw]}」`);
      continue;
    }
    const { ns, value } = parseTag(raw);
    if (!ns) {
      errors.push(`「${raw}」缺少命名空间，应形如 namespace/value（如 topic/${raw}）`);
      continue;
    }
    const d = nsDef(ns);
    if (!d) {
      errors.push(`「${raw}」的命名空间「${ns}」不在白名单：${Object.keys(NAMESPACES).join(' / ')}`);
      continue;
    }
    if (!VALUE_RE.test(value)) {
      errors.push(`「${raw}」的值不合规：仅限字母 / 数字 / 连字符，不含空格、下划线或中文`);
    }
    if (d.values && !d.values.includes(value)) {
      errors.push(`「${raw}」的 type 须取自封闭枚举：${d.values.join(' / ')}`);
    }
    perNs.set(ns, (perNs.get(ns) ?? 0) + 1);
  }

  for (const [ns, count] of perNs) {
    const max = nsDef(ns)?.max;
    if (max && count > max) {
      errors.push(`命名空间「${ns}」每篇最多 ${max} 个标签，当前 ${count} 个`);
    }
  }
  return errors;
}

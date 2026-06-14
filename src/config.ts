export const SITE = {
  title: 'Dingfan X.',
  description: '技术 · 投研 · 工坊 · 旧思 · 阅读 —— 个人刊物',
  url: 'https://dingfanx.com',
  author: 'Dingfan',
  email: 'comments@dingfanx.com',
  github: 'https://github.com/ddd829',
};

export type SectionKey = 'tech' | 'research' | 'workshop' | 'news' | 'reading';
export type PostMode = 'essay' | 'tech';

export const SECTIONS: Record<SectionKey, { name: string; mode: PostMode; desc: string }> = {
  tech: { name: '技术', mode: 'tech', desc: '嵌入式、系统与工程实践' },
  research: { name: '投研', mode: 'tech', desc: '市场研究与财经思考' },
  workshop: { name: '工坊', mode: 'tech', desc: '动手做的项目与工具' },
  news: { name: '旧思', mode: 'essay', desc: '旧文重读与时代切片' },
  reading: { name: '阅读', mode: 'essay', desc: '中外文学与札记' },
};

// 评论：部署 Waline 服务端后填入其地址，如 'https://your-waline.vercel.app'
// 在 Waline 后台开启「评论审核」(先审后发) 与敏感词/垃圾过滤以满足合规要求。
export const WALINE = {
  serverURL: '',
};

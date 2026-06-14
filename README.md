# dingfanx.com

个人刊物 —— Astro 静态站。

## 日常写作

1. 在 `src/content/posts/<栏目>/` 新建 `<slug>.md`（栏目：tech / research / workshop / news / reading）
2. frontmatter 必填 `title`、`date`；可选 `summary`、`tags`、`draft`、`pinned`、`layout`（essay/tech，覆盖栏目默认版式）、`cover`、`updated`、`number`
3. 本地预览 `npm run dev`；推送 main 分支即发布

## Markdown 扩展

- 代码标题：` ```c title="file.c" `
- 提示块：`:::tip` / `:::warn` / `:::note` … `:::`
- 公式：`$...$` 与 `$$...$$`（KaTeX）；Mermaid：` ```mermaid `

## 命令

- `npm run dev` 开发（草稿可见；搜索不可用）
- `npm run build` 构建 + Pagefind 索引
- `npm run preview` 预览构建产物（搜索可用）
- `npm test` / `npm run check` 测试与类型检查

## 部署（Cloudflare Pages）

构建命令 `npm run build`，输出目录 `dist`，根目录 `/`，环境变量 `NODE_VERSION=22`。

## 评论（Waline）

部署 Waline 服务端（Vercel / Cloudflare + 数据库）→ 在后台开启「评论审核」(先审后发) 与敏感词/垃圾过滤 → 把服务地址填入 `src/config.ts` 的 `WALINE.serverURL`。
若 Waline 服务在固定域名，建议把该域名加入 `public/_headers` 的 CSP `connect-src` 收紧。

## 安全

`public/_headers` 设置了 CSP、HSTS、`frame-ancestors 'none'`(防点击劫持)等响应头(Cloudflare Pages 自动生效)。
账号侧请确保 GitHub / Cloudflare / 域名注册商均开启 2FA，并开启分支保护。

## 旧站

Hugo 源文件归档于 `hugo-legacy/`，新站稳定运行一周后可删除。

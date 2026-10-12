/**
 * 站点配置 —— 改这里就能改整个站点的名字、导航、分类和部署地址。
 */
export default {
  // ---------- 基本信息 ----------
  title: 'DevNotes',
  subtitle: '开发手记',
  description: '记录 AI 编程学习、实战小项目、开发工具使用与 Bug 排查解决的全过程。',
  author: '双非小文学AI',
  email: '1846417893@qq.com',

  // ---------- 部署 ----------
  // 站点完整地址（用于 RSS / sitemap / og:url）。绑定自定义域名后改成自己的域名。
  url: 'https://example.com',
  // 部署到 GitHub Pages 的「项目地址」时（形如 https://用户名.github.io/仓库名/），
  // 把 base 改成 '/仓库名'；部署到 Vercel / Netlify / 自定义域名时保持空字符串。
  base: '',
  // 源码仓库地址，文章页会生成「编辑此页」链接
  repo: 'https://github.com/liubei123394/tech-blog',
  repoBranch: 'main',
  // 网站备案号（留空则不显示）
  icp: '',

  // ---------- 导航 ----------
  nav: [
    { key: 'home', label: '首页', href: '/' },
    { key: 'ai', label: 'AI 编程', href: '/category/ai.html' },
    { key: 'bug', label: 'Bug 排查', href: '/category/bug.html' },
    { key: 'project', label: '实战项目', href: '/category/project.html' },
    { key: 'tools', label: '工具笔记', href: '/category/tools.html' },
    { key: 'archive', label: '归档', href: '/archive.html' },
    { key: 'about', label: '关于', href: '/about.html' },
  ],

  // ---------- 文章分类 ----------
  // key 会写进文章的 frontmatter：category: bug
  categories: {
    ai:      { name: 'AI 编程',  desc: '大模型调用、Prompt 工程、AI 辅助编码的踩坑与心得', icon: '◆' },
    bug:     { name: 'Bug 排查', desc: '报错信息背后的真实原因，以及定位问题的方法论',   icon: '▲' },
    project: { name: '实战项目', desc: '从想法到上线，完整记录每个小项目的搭建过程',     icon: '■' },
    tools:   { name: '工具笔记', desc: '开发工具、环境配置、部署流程的备忘录',           icon: '●' },
  },

  // ---------- 公众号 ----------
  // 每篇文章右上角有「复制到公众号」按钮，会复制带内联样式的富文本，
  // 直接粘贴进公众号编辑器即可保留排版。
  wechat: {
    name: '双非小文学AI',
    slogan: '同步更新，欢迎关注',
  },

  // ---------- 首页 ----------
  home: {
    heading: '把踩过的坑，写成路标',
    intro: '这里记录我学习 AI 编程、做实战小项目的全过程 —— 工具怎么用、网站怎么上线、Bug 怎么定位。写下来，是为了下次少走弯路；分享出来，也许能帮你省一点时间。',
    // 首页每页显示多少篇
    pageSize: 12,
  },

  // ---------- 页脚 ----------
  footer: {
    brand: '双非小文学AI 的博客',
    note: '本站使用零依赖 Node 脚本生成静态页面，源码托管在 GitHub。',
  },
};

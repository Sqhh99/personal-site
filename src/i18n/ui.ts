export const LANGUAGES = {
  en: 'EN',
  zh: '中文',
} as const;

export type Language = keyof typeof LANGUAGES;

export const DEFAULT_LANG: Language = 'en';

export const UI_STRINGS = {
  en: {
    'site.title': 'Sqhh99',
    'site.name': 'Sqhh99',
    'site.role': 'Software Engineer',
    'site.tagline': 'Notes on software, systems, and engineering',
    'site.description':
      'Writing on realtime media, deep learning, software engineering, and systems.',
    'site.subtitle': 'Writing',

    'nav.home': 'Home',
    'nav.writing': 'Writing',
    'nav.briefs': 'Briefs',

    'hero.badge': 'Sqhh99',
    'hero.title': 'Sqhh99',
    'hero.lead':
      'Notes on realtime media, deep learning, software engineering, and systems.',
    'hero.cta.writing': 'Read writing',

    'writing.index': 'Writing',
    'writing.title': 'Recent writing',
    'writing.lede': 'Notes and essays on software engineering, media pipelines, and systems.',
    'writing.viewAll': 'View all writing',

    'contact.index': 'Contact',
    'contact.title': 'Get in touch, or read the source.',
    'contact.source': "This site's source code",

    'blog.title': 'Writing — Sqhh99',
    'blog.heading': 'Writing',
    'blog.description':
      'articles on realtime media, deep learning, and software systems.',
    'blog.searchPlaceholder': 'Search posts by title, tag, or topic...',
    'blog.showing': 'Showing',
    'blog.postSingular': 'post',
    'blog.postPlural': 'posts',
    'blog.filterAll': 'All',
    'blog.empty': 'No posts match that filter.',
    'blog.prevPage': 'Previous',
    'blog.nextPage': 'Next',
    'blog.pageStatus': 'Page {current} of {total}',
    'blog.pagination': 'Writing pagination',
    'blog.searchAria': 'Search writing',
    'blog.clearSearch': 'Clear search query',
    'blog.filterByTag': 'Filter by tag',
    'blog.back': 'Back to writing',
    'blog.readPost': 'Read post',
    'blog.prevNote': 'Previous post',
    'blog.nextNote': 'Next post',
    'blog.minRead': 'min read',
    'blog.copy': 'Copy',
    'blog.copied': 'Copied!',

    'briefs.title': 'AI Briefs — Sqhh99',
    'briefs.heading': 'AI Daily Briefs',
    'briefs.description': 'Daily AI news briefs tracking model releases, research, and industry developments.',
    'briefs.back': 'Back to briefs',
    'briefs.readBrief': 'Read brief',
    'briefs.prevBrief': 'Previous brief',
    'briefs.nextBrief': 'Next brief',

    'footer.builtWith': 'Built with Astro, deployed on Cloudflare',
    'footer.rss': 'RSS',
    'footer.source': 'Source',
    'footer.backToTop': 'Back to top',

    '404.title': '404 — Page Not Found',
    '404.heading': 'Page not found',
    '404.message': "The page you're looking for doesn't exist or has been moved.",
    '404.back': 'Back to Home',
  },
  zh: {
    'site.title': 'Sqhh99',
    'site.name': 'Sqhh99',
    'site.role': '软件工程师',
    'site.tagline': '关于软件、系统与工程的思考与笔记',
    'site.description':
      '关于 WebRTC 与实时媒体、PyTorch 与深度学习、Web 性能与系统的文章与笔记。',
    'site.subtitle': 'Writing',

    'nav.home': '首页',
    'nav.writing': '文章',
    'nav.briefs': '简报',

    'hero.badge': 'Sqhh99',
    'hero.title': 'Sqhh99',
    'hero.lead':
      '关于实时媒体、深度学习、Web 性能与系统的思考与笔记。',
    'hero.cta.writing': '阅读文章',

    'writing.index': '文章',
    'writing.title': '近期文章',
    'writing.lede': '记录在工程实践与系统调优过程中的思考与细节。',
    'writing.viewAll': '查看全部文章',

    'contact.index': '联系',
    'contact.title': '保持联系，或查看源码。',
    'contact.source': '本站源代码',

    'blog.title': '文章 — Sqhh99',
    'blog.heading': '文章',
    'blog.description': '篇关于实时媒体、深度学习及底层性能优化的文章。',
    'blog.searchPlaceholder': '按标题、标签或主题搜索文章...',
    'blog.showing': '显示',
    'blog.postSingular': '篇文章',
    'blog.postPlural': '篇文章',
    'blog.filterAll': '全部',
    'blog.empty': '没有找到匹配的文章。',
    'blog.prevPage': '上一页',
    'blog.nextPage': '下一页',
    'blog.pageStatus': '第 {current} / {total} 页',
    'blog.pagination': '文章分页',
    'blog.searchAria': '搜索文章',
    'blog.clearSearch': '清除搜索内容',
    'blog.filterByTag': '按标签筛选',
    'blog.back': '返回文章列表',
    'blog.readPost': '阅读全文',
    'blog.prevNote': '上一篇',
    'blog.nextNote': '下一篇',
    'blog.minRead': '分钟阅读',
    'blog.copy': '复制',
    'blog.copied': '已复制！',

    'briefs.title': 'AI 新闻简报 — Sqhh99',
    'briefs.heading': 'AI 每日新闻简报',
    'briefs.description': '每日 AI 新闻简报，追踪模型发布、前沿研究与行业动态。',
    'briefs.back': '返回简报列表',
    'briefs.readBrief': '阅读简报',
    'briefs.prevBrief': '上一篇简报',
    'briefs.nextBrief': '下一篇简报',

    'footer.builtWith': '基于 Astro 构建，部署于 Cloudflare',
    'footer.rss': 'RSS',
    'footer.source': '源码',
    'footer.backToTop': '返回顶部',

    '404.title': '404 — 页面未找到',
    '404.heading': '页面未找到',
    '404.message': '您访问的页面不存在或已被移动。',
    '404.back': '返回首页',
  },
} as const;

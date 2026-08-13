export const LANGUAGES = {
  en: 'EN',
  zh: '中文',
  ja: '日本語',
} as const;

export type Language = keyof typeof LANGUAGES;

export const DEFAULT_LANG: Language = 'en';

export const HTML_LANG: Record<Language, string> = {
  en: 'en',
  zh: 'zh-CN',
  ja: 'ja',
};

export const DATE_LOCALE: Record<Language, string> = {
  en: 'en-GB',
  zh: 'zh-CN',
  ja: 'ja-JP',
};

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
    'nav.language': 'Language',


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
    'blog.contents': 'Contents',

    'pager.prev': 'Previous',
    'pager.next': 'Next',
    'pager.status': 'Page {current} of {total}',
    'pager.label': 'Pagination',

    'briefs.title': 'AI Briefs — Sqhh99',
    'briefs.heading': 'AI Daily Briefs',
    'briefs.description': 'Daily AI news briefs tracking model releases, research, and industry developments.',
    'briefs.empty': 'No briefs have been published yet.',
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
    '404.kicker': 'Error 404',
    '404.message': "The page you're looking for doesn't exist or has been moved.",
    '404.back': 'Back to Home',

    'a11y.skip': 'Skip to content',
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
    'nav.language': '语言',


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
    'blog.contents': '目录',

    'pager.prev': '上一页',
    'pager.next': '下一页',
    'pager.status': '第 {current} / {total} 页',
    'pager.label': '分页导航',

    'briefs.title': 'AI 新闻简报 — Sqhh99',
    'briefs.heading': 'AI 每日新闻简报',
    'briefs.description': '每日 AI 新闻简报，追踪模型发布、前沿研究与行业动态。',
    'briefs.empty': '暂无简报。',
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
    '404.kicker': '错误 404',
    '404.message': '您访问的页面不存在或已被移动。',
    '404.back': '返回首页',

    'a11y.skip': '跳到正文',
  },
  ja: {
    'site.title': 'Sqhh99',
    'site.name': 'Sqhh99',
    'site.role': 'ソフトウェアエンジニア',
    'site.tagline': 'ソフトウェア、システム、エンジニアリングについてのノート',
    'site.description':
      'リアルタイムメディア、深層学習、ソフトウェア工学、システムについての文章。',
    'site.subtitle': 'Writing',

    'nav.home': 'ホーム',
    'nav.writing': '文章',
    'nav.briefs': 'ブリーフ',
    'nav.language': '言語',

    'writing.index': '文章',
    'writing.title': '最近の文章',
    'writing.lede': 'ソフトウェア工学、メディアパイプライン、システムについてのノートとエッセイ。',
    'writing.viewAll': 'すべての文章を見る',

    'contact.index': '連絡',
    'contact.title': '連絡する、またはソースを読む。',
    'contact.source': 'このサイトのソースコード',

    'blog.title': '文章 — Sqhh99',
    'blog.heading': '文章',
    'blog.description': 'リアルタイムメディア、深層学習、ソフトウェアシステムについての記事。',
    'blog.searchPlaceholder': 'タイトル、タグ、トピックで検索...',
    'blog.showing': '表示中',
    'blog.postSingular': '件',
    'blog.postPlural': '件',
    'blog.filterAll': 'すべて',
    'blog.empty': '条件に合う記事がありません。',
    'blog.searchAria': '文章を検索',
    'blog.clearSearch': '検索をクリア',
    'blog.filterByTag': 'タグで絞り込む',
    'blog.back': '文章一覧へ戻る',
    'blog.readPost': '記事を読む',
    'blog.prevNote': '前の記事',
    'blog.nextNote': '次の記事',
    'blog.minRead': '分で読めます',
    'blog.copy': 'コピー',
    'blog.copied': 'コピーしました',
    'blog.contents': '目次',

    'pager.prev': '前へ',
    'pager.next': '次へ',
    'pager.status': '{current} / {total} ページ',
    'pager.label': 'ページ送り',

    'briefs.title': 'AI ブリーフ — Sqhh99',
    'briefs.heading': 'AI デイリーブリーフ',
    'briefs.description': 'モデル公開、研究、業界の動きを追う毎日の AI ニュース。',
    'briefs.empty': 'まだブリーフはありません。',
    'briefs.back': 'ブリーフ一覧へ戻る',
    'briefs.readBrief': 'ブリーフを読む',
    'briefs.prevBrief': '前のブリーフ',
    'briefs.nextBrief': '次のブリーフ',

    'footer.builtWith': 'Astro で構築、Cloudflare にデプロイ',
    'footer.rss': 'RSS',
    'footer.source': 'ソース',
    'footer.backToTop': 'ページ上部へ',

    '404.title': '404 — ページが見つかりません',
    '404.heading': 'ページが見つかりません',
    '404.kicker': 'エラー 404',
    '404.message': 'お探しのページは存在しないか、移動した可能性があります。',
    '404.back': 'ホームへ戻る',

    'a11y.skip': '本文へスキップ',
  },
} as const;

export type UiKey = keyof typeof UI_STRINGS.en;

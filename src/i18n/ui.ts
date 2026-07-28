export const LANGUAGES = {
  en: 'EN',
  zh: '中文',
} as const;

export type Language = keyof typeof LANGUAGES;

export const DEFAULT_LANG: Language = 'en';

export const UI_STRINGS = {
  en: {
    'site.title': 'Xiao Xu — Engineering Notes',
    'site.name': 'Xiao Xu',
    'site.role': 'Software Engineer',
    'site.tagline': 'Notes on realtime media, deep learning and the web',
    'site.description':
      'Engineering notes on WebRTC and realtime media, PyTorch and deep learning, web performance and systems.',
    'site.subtitle': 'Engineering Notes',

    'nav.home': 'Home',
    'nav.writing': 'Writing',
    'nav.focus': 'Focus',
    'nav.about': 'About',

    'hero.badge': 'Software Engineer',
    'hero.title.1': 'Notes on ',
    'hero.title.media': 'realtime media',
    'hero.title.2': ', deep learning, and the parts of the web that resist abstraction.',
    'hero.lead':
      "I'm Xiao Xu, a software engineer working on WebRTC pipelines, PyTorch training and inference, and the performance work that sits underneath both. This is where I write the details down.",
    'hero.cta.writing': 'Read the writing',
    'hero.cta.focus': 'What I work on',

    'focus.index': '01 / Focus',
    'focus.title': 'What I work on',
    'focus.lede':
      'Four areas that keep overlapping in practice — a dropped frame and a stalled training step usually turn out to be the same class of problem.',
    'focus.areas': [
      {
        index: '01',
        title: 'Realtime media',
        description:
          'WebRTC end to end — signalling, ICE and NAT traversal, media pipelines, and the latency budget that decides whether a call feels live.',
        tags: ['WebRTC', 'SDP / ICE', 'RTP', 'SFU'],
      },
      {
        index: '02',
        title: 'Deep learning',
        description:
          'PyTorch from the training loop down: where the time actually goes, how data loading starves the GPU, and what quantisation costs you.',
        tags: ['PyTorch', 'CUDA', 'Profiling', 'Inference'],
      },
      {
        index: '03',
        title: 'Web engineering',
        description:
          'TypeScript, rendering strategies and build tooling. Shipping the smallest amount of JavaScript that still does the job.',
        tags: ['TypeScript', 'Astro', 'Rendering', 'Tooling'],
      },
      {
        index: '04',
        title: 'Systems & performance',
        description:
          'Concurrency, backpressure, memory and measurement. Most performance work is really a queueing problem wearing a costume.',
        tags: ['Concurrency', 'Backpressure', 'Memory', 'Tracing'],
      },
    ],

    'writing.index': '02 / Writing',
    'writing.title': 'Recent notes',
    'writing.lede': 'Longer pieces on problems that took more than an afternoon to understand.',
    'writing.viewAll': 'View all engineering notes',

    'about.index': '03 / About',
    'about.title': 'About',
    'about.lead':
      'I build software where the hard part is not the feature, but the boundary — the point where code meets a network, a GPU, or somebody else’s runtime.',
    'about.paragraphs': [
      'Most of my time goes to realtime media and machine learning systems: the kind of code where a p99 number matters more than a feature list, and where "it works on my machine" is the beginning of the investigation rather than the end of it.',
      'I write things down here because the interesting part of an engineering problem is rarely the answer. It is the constraints that made the answer necessary — and those are exactly what gets lost when you only ship the fix.',
    ],
    'about.specs': [
      { label: 'Role', value: 'Software Engineer' },
      { label: 'Focus', value: 'Realtime media · Deep learning' },
      { label: 'Stack', value: 'TypeScript · Python · C++' },
      { label: 'Handle', value: '@Sqhh99' },
    ],

    'contact.index': '04 / Contact',
    'contact.title': 'Say hello, or read the source.',
    'contact.source': "This site's source code",

    'blog.title': 'Writing — Xiao Xu',
    'blog.heading': 'Engineering notes',
    'blog.description':
      'articles on realtime media, deep learning, and the performance work underneath both.',
    'blog.searchPlaceholder': 'Search posts by title, tag, or topic...',
    'blog.showing': 'Showing',
    'blog.postSingular': 'post',
    'blog.postPlural': 'posts',
    'blog.filterAll': 'All',
    'blog.empty': 'No posts match that filter.',
    'blog.back': '← Back to all writing',
    'blog.readPost': 'Read post',
    'blog.prevNote': 'Previous Note',
    'blog.nextNote': 'Next Note',
    'blog.minRead': 'min read',
    'blog.copy': 'Copy',
    'blog.copied': 'Copied!',

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
    'site.title': '徐肖 — 工程笔记',
    'site.name': '徐肖',
    'site.role': '软件工程师',
    'site.tagline': '关于实时媒体、深度学习与 Web 的工程笔记',
    'site.description':
      '关于 WebRTC 与实时媒体、PyTorch 与深度学习、Web 性能与系统的工程笔记。',
    'site.subtitle': '工程笔记',

    'nav.home': '首页',
    'nav.writing': '文章',
    'nav.focus': '关注领域',
    'nav.about': '关于',

    'hero.badge': '软件工程师',
    'hero.title.1': '关于 ',
    'hero.title.media': '实时媒体',
    'hero.title.2': '、深度学习以及那些拒绝抽象的 Web 技术的工程笔记。',
    'hero.lead':
      '我是徐肖，一名专注于 WebRTC 传输管线、PyTorch 训练与推理以及底层性能调优的软件工程师。这里记录了我对这些领域的思考与细节。',
    'hero.cta.writing': '阅读工程笔记',
    'hero.cta.focus': '关注领域',

    'focus.index': '01 / 关注领域',
    'focus.title': '我的关注领域',
    'focus.lede':
      '在实践中不断重叠的四个领域——掉帧与训练停滞往往归结为同一种类型的问题。',
    'focus.areas': [
      {
        index: '01',
        title: '实时媒体',
        description:
          '端到端 WebRTC——信令、ICE 与 NAT 穿透、媒体传输管线，以及决定通话实时感的延迟预算。',
        tags: ['WebRTC', 'SDP / ICE', 'RTP', 'SFU'],
      },
      {
        index: '02',
        title: '深度学习',
        description:
          '从训练循环深入 PyTorch：时间究竟花在哪里，数据加载如何打断 GPU，以及量化的代价。',
        tags: ['PyTorch', 'CUDA', 'Profiling', 'Inference'],
      },
      {
        index: '03',
        title: 'Web 工程',
        description:
          'TypeScript、渲染策略与构建工具。以最小的 JavaScript 传输量完成所需功能。',
        tags: ['TypeScript', 'Astro', 'Rendering', 'Tooling'],
      },
      {
        index: '04',
        title: '系统与性能',
        description:
          '并发、背压、内存与测量。大多数性能调优本质上都是伪装成其他问题的排队问题。',
        tags: ['Concurrency', 'Backpressure', 'Memory', 'Tracing'],
      },
    ],

    'writing.index': '02 / 文章',
    'writing.title': '近期笔记',
    'writing.lede': '记录那些需要花费半天以上时间才能厘清的深层问题。',
    'writing.viewAll': '查看全部工程笔记',

    'about.index': '03 / 关于',
    'about.title': '关于我',
    'about.lead':
      '我所构建的软件，最难的往往不是功能本身，而是边界——代码与网络、GPU 或第三方运行时的交汇之处。',
    'about.paragraphs': [
      '我的大大部分时间致力于实时媒体和机器学习系统：在这类代码中，p99 延迟指标远比功能清单更重要，“在我电脑上能运行”往往是排查问题的开端而非终点。',
      '我在这里写下这些内容，是因为工程问题中最有趣的部分很少是最终答案，而是促成该答案的前提约束——而这恰恰是在仅交付修补代码时最容易丢失的东西。',
    ],
    'about.specs': [
      { label: '角色', value: '软件工程师' },
      { label: '领域', value: '实时媒体 · 深度学习' },
      { label: '技术栈', value: 'TypeScript · Python · C++' },
      { label: 'Handle', value: '@Sqhh99' },
    ],

    'contact.index': '04 / 联系',
    'contact.title': '打个招呼，或阅读源码。',
    'contact.source': '本站源代码',

    'blog.title': '文章 — 徐肖',
    'blog.heading': '工程笔记',
    'blog.description': '篇关于实时媒体、深度学习及底层性能优化的文章。',
    'blog.searchPlaceholder': '按标题、标签或主题搜索文章...',
    'blog.showing': '显示',
    'blog.postSingular': '篇文章',
    'blog.postPlural': '篇文章',
    'blog.filterAll': '全部',
    'blog.empty': '没有找到匹配的文章。',
    'blog.back': '← 返回全部文章',
    'blog.readPost': '阅读全文',
    'blog.prevNote': '上一篇',
    'blog.nextNote': '下一篇',
    'blog.minRead': '分钟阅读',
    'blog.copy': '复制',
    'blog.copied': '已复制！',

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

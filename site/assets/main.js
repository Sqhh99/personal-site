import { focusAreas, posts, projects, siteConfig } from './config.js';

const icons = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.35 1.08 2.92.83.09-.64.35-1.08.64-1.33-2.22-.25-4.55-1.1-4.55-4.93 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.84a9.6 9.6 0 0 1 2.5.34c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86V21c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
};

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const formatInline = (text) => escapeHtml(text)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

const markdownToHtml = (source) => {
  const body = source.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  const lines = body.split(/\r?\n/);
  const output = [];
  let paragraph = [];
  let list = [];
  let code = [];
  let inCode = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      output.push(`<p>${formatInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      output.push(`<ul>${list.map((item) => `<li>${formatInline(item)}</li>`).join('')}</ul>`);
      list = [];
    }
  };

  lines.forEach((line) => {
    if (line.trim().startsWith('```')) {
      flushParagraph();
      flushList();
      if (inCode) {
        output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = [];
      }
      inCode = !inCode;
      return;
    }
    if (inCode) {
      code.push(line);
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      output.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      return;
    }
    const listItem = line.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1]);
      return;
    }
    paragraph.push(line.trim());
  });

  flushParagraph();
  flushList();
  if (code.length) output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  return output.join('\n');
};

const app = document.querySelector('#app');

const renderLayout = () => {
  app.innerHTML = `
    <div class="reading-progress" aria-hidden="true"><span></span></div>
    <header class="site-header">
      <div class="header-inner shell">
        <a class="brand" href="#top" aria-label="返回首页">
          <span class="brand-mark">XX</span>
          <span class="brand-text"><strong>${escapeHtml(siteConfig.name)}</strong><small>${escapeHtml(siteConfig.title)}</small></span>
        </a>
        <nav class="desktop-nav" aria-label="主导航">
          <a href="#about">关于</a><a href="#focus">方向</a><a href="#projects">项目</a><a href="#blog">文章</a>
        </nav>
        <div class="header-actions">
          <button class="icon-button theme-toggle" type="button" aria-label="切换主题"></button>
          <a class="github-link" href="${siteConfig.github}" target="_blank" rel="noreferrer">${icons.github}<span>GitHub</span></a>
          <button class="icon-button menu-toggle" type="button" aria-label="打开菜单">${icons.menu}</button>
        </div>
      </div>
      <nav class="mobile-nav" aria-label="移动端导航"><a href="#about">关于</a><a href="#focus">方向</a><a href="#projects">项目</a><a href="#blog">文章</a></nav>
    </header>

    <main id="top">
      <section class="hero shell">
        <div class="hero-grid">
          <div class="hero-copy reveal">
            <p class="eyebrow"><span></span>${escapeHtml(siteConfig.role)}</p>
            <h1>把复杂问题<br /><em>做成可靠系统。</em></h1>
            <p class="hero-intro">${escapeHtml(siteConfig.intro)}</p>
            <div class="hero-actions"><a class="primary-button" href="#blog">阅读文章 ${icons.arrow}</a><a class="text-button" href="#projects">查看实践</a></div>
            <ul class="keyword-list" aria-label="技术关键词">${siteConfig.keywords.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          </div>
          <div class="hero-visual reveal" aria-hidden="true">
            <div class="orb orb-a"></div><div class="orb orb-b"></div>
            <div class="signal-card signal-card-main">
              <div class="signal-header"><span>LIVE FIELD</span><span class="live-dot"></span></div>
              <svg viewBox="0 0 420 210" role="img">
                <defs><linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#67e8f9" /><stop offset="1" stop-color="#8b5cf6" /></linearGradient></defs>
                <path class="grid-line" d="M0 42h420M0 84h420M0 126h420M0 168h420M84 0v210M168 0v210M252 0v210M336 0v210" />
                <path class="wave-line ghost" d="M0 118C35 118 39 72 71 72s39 78 75 78 42-108 78-108 38 132 77 132 41-84 75-84 26 28 44 28" />
                <path class="wave-line" d="M0 118C35 118 39 72 71 72s39 78 75 78 42-108 78-108 38 132 77 132 41-84 75-84 26 28 44 28" />
                <circle cx="224" cy="42" r="5" class="pulse-node" />
              </svg>
              <div class="signal-meta"><span>Signal integrity</span><strong>98.7%</strong></div>
            </div>
            <div class="signal-card stat-card stat-card-a"><small>BUILD</small><strong>Stable</strong><span>cross-platform</span></div>
            <div class="signal-card stat-card stat-card-b"><small>FOCUS</small><strong>Observe</strong><span>verify · iterate</span></div>
          </div>
        </div>
      </section>

      <section class="section shell" id="about">
        <div class="section-heading reveal"><p class="section-index">01 / ABOUT</p><h2>关于我</h2></div>
        <div class="about-grid">
          <div class="about-lead reveal"><p>我是一名软件工程与智能监测方向的研发人员，关注代码如何连接真实设备、数据和业务决策。</p></div>
          <div class="about-detail reveal"><p>工作与学习内容横跨桌面端工程软件、通信协议、信号处理、嵌入式系统和本地模型部署。我更重视问题定义、技术边界与验证过程，而不是仅仅让功能“看起来可以运行”。</p><p>这个网站用于整理技术笔记、项目思路和阶段性结论。所有内容会尽量保留背景、条件与推导过程，便于后续复盘和持续修正。</p><div class="identity-line"><span>${escapeHtml(siteConfig.handle)}</span><span>${escapeHtml(siteConfig.location)}</span></div></div>
        </div>
      </section>

      <section class="section section-tinted" id="focus"><div class="shell">
        <div class="section-heading reveal"><p class="section-index">02 / FOCUS</p><h2>关注方向</h2></div>
        <div class="focus-grid">${focusAreas.map((area) => `<article class="focus-card reveal"><span class="card-index">${area.index}</span><h3>${escapeHtml(area.title)}</h3><p>${escapeHtml(area.description)}</p><ul>${area.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('')}</ul></article>`).join('')}</div>
      </div></section>

      <section class="section shell" id="projects">
        <div class="section-heading heading-split reveal"><div><p class="section-index">03 / PROJECTS</p><h2>实践主题</h2></div><p>从需求背景、数据链路到算法与交付形式，记录真实工程问题的拆解过程。</p></div>
        <div class="project-list">${projects.map((project, index) => `<a class="project-row reveal" href="${project.link}"><span class="project-number">${String(index + 1).padStart(2, '0')}</span><div class="project-main"><small>${escapeHtml(project.type)}</small><h3>${escapeHtml(project.title)}</h3><p>${escapeHtml(project.description)}</p></div><span class="project-status">${escapeHtml(project.status)}</span><span class="project-arrow">${icons.arrow}</span></a>`).join('')}</div>
      </section>

      <section class="section section-tinted" id="blog"><div class="shell">
        <div class="section-heading heading-split reveal"><div><p class="section-index">04 / JOURNAL</p><h2>技术文章</h2></div><div class="blog-tools"><label class="search-box">${icons.search}<input id="post-search" type="search" placeholder="搜索文章" autocomplete="off" /></label></div></div>
        <div class="tag-filter reveal" id="tag-filter"></div><div class="post-grid" id="post-grid"></div><p class="empty-state" id="empty-state" hidden>没有找到匹配的文章。</p>
      </div></section>

      <section class="contact-section shell reveal"><div><p class="section-index">05 / CONTACT</p><h2>保持连接，持续构建。</h2></div><a class="primary-button" href="${siteConfig.github}" target="_blank" rel="noreferrer">访问 GitHub ${icons.arrow}</a></section>
    </main>

    <footer class="site-footer"><div class="shell footer-inner"><p>© ${new Date().getFullYear()} ${escapeHtml(siteConfig.name)}. Built with native web technologies and deployed on Cloudflare.</p><a href="#top">Back to top ↑</a></div></footer>

    <dialog class="post-dialog" id="post-dialog"><div class="dialog-shell"><button class="dialog-close icon-button" type="button" aria-label="关闭文章">${icons.close}</button><article class="post-article" id="post-article"></article></div></dialog>
  `;
};

let activeTag = '全部';
let searchTerm = '';

const renderTagFilter = () => {
  const tags = ['全部', ...new Set(posts.map((post) => post.tag))];
  document.querySelector('#tag-filter').innerHTML = tags.map((tag) => `<button type="button" class="tag-button ${tag === activeTag ? 'active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('');
};

const renderPosts = () => {
  const normalizedTerm = searchTerm.trim().toLowerCase();
  const filteredPosts = posts.filter((post) => {
    const matchesTag = activeTag === '全部' || post.tag === activeTag;
    return matchesTag && (!normalizedTerm || `${post.title} ${post.summary} ${post.tag}`.toLowerCase().includes(normalizedTerm));
  });
  const grid = document.querySelector('#post-grid');
  grid.innerHTML = filteredPosts.map((post, index) => `<button class="post-card reveal visible ${post.featured ? 'featured' : ''}" type="button" data-slug="${escapeHtml(post.slug)}"><div class="post-card-top"><span>${escapeHtml(post.tag)}</span><span>${formatDate(post.date)}</span></div><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.summary)}</p><div class="post-card-bottom"><span>${escapeHtml(post.readTime)}</span><span>阅读 ${icons.arrow}</span></div>${index === 0 ? '<span class="featured-label">LATEST</span>' : ''}</button>`).join('');
  document.querySelector('#empty-state').hidden = filteredPosts.length > 0;
};

const openPost = async (slug, updateUrl = true) => {
  const post = posts.find((item) => item.slug === slug);
  if (!post) return;
  const article = document.querySelector('#post-article');
  article.innerHTML = '<p class="empty-state">正在加载文章……</p>';
  const dialog = document.querySelector('#post-dialog');
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('dialog-open');

  try {
    const response = await fetch(post.file);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const source = await response.text();
    article.innerHTML = `<header class="article-header"><div class="article-meta"><span>${escapeHtml(post.tag)}</span><span>${formatDate(post.date)}</span><span>${escapeHtml(post.readTime)}</span></div><h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(post.summary)}</p></header><div class="article-body">${markdownToHtml(source)}</div><footer class="article-footer"><span>END OF ARTICLE</span><a href="${siteConfig.repository}" target="_blank" rel="noreferrer">查看网站源码 ${icons.arrow}</a></footer>`;
  } catch (error) {
    article.innerHTML = `<p class="empty-state">文章加载失败。请通过本地服务器或网站域名访问，不要直接双击 index.html。<br>${escapeHtml(error.message)}</p>`;
  }

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('post', slug);
    history.pushState({ post: slug }, '', url);
  }
};

const closePost = (updateUrl = true) => {
  const dialog = document.querySelector('#post-dialog');
  if (dialog.open) dialog.close();
  document.body.classList.remove('dialog-open');
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.delete('post');
    history.pushState({}, '', url);
  }
};

const setTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  const toggle = document.querySelector('.theme-toggle');
  toggle.innerHTML = theme === 'dark' ? icons.sun : icons.moon;
  toggle.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
};

const initTheme = () => {
  const saved = localStorage.getItem('theme');
  const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  setTheme(saved || preferred);
};

const initReveal = () => {
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
};

const initEvents = () => {
  document.querySelector('.theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  const menuButton = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('.mobile-nav');
  menuButton.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('open');
    menuButton.innerHTML = open ? icons.close : icons.menu;
  });
  mobileNav.addEventListener('click', () => { mobileNav.classList.remove('open'); menuButton.innerHTML = icons.menu; });
  document.querySelector('#tag-filter').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tag]');
    if (!button) return;
    activeTag = button.dataset.tag;
    renderTagFilter();
    renderPosts();
  });
  document.querySelector('#post-search').addEventListener('input', (event) => { searchTerm = event.target.value; renderPosts(); });
  document.querySelector('#post-grid').addEventListener('click', (event) => {
    const card = event.target.closest('[data-slug]');
    if (card) openPost(card.dataset.slug);
  });
  document.querySelector('.dialog-close').addEventListener('click', () => closePost());
  document.querySelector('#post-dialog').addEventListener('click', (event) => { if (event.target.id === 'post-dialog') closePost(); });
  document.querySelector('#post-dialog').addEventListener('cancel', (event) => { event.preventDefault(); closePost(); });
  window.addEventListener('popstate', () => {
    const slug = new URL(window.location.href).searchParams.get('post');
    if (slug) openPost(slug, false); else closePost(false);
  });
  window.addEventListener('scroll', () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    document.querySelector('.reading-progress span').style.transform = `scaleX(${scrollable > 0 ? window.scrollY / scrollable : 0})`;
  }, { passive: true });
};

renderLayout();
initTheme();
renderTagFilter();
renderPosts();
initEvents();
initReveal();
const initialPost = new URL(window.location.href).searchParams.get('post');
if (initialPost) openPost(initialPost, false);

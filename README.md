# personal-site

一个不依赖博客框架的个人介绍与技术博客网站，使用原生 HTML、CSS、JavaScript 和 Markdown 构建，可直接部署到 Cloudflare。

## 项目结构

```text
personal-site/
├── site/                         # 可直接托管的网站目录
│   ├── index.html
│   ├── favicon.svg
│   ├── assets/
│   │   ├── config.js            # 个人信息、项目和文章索引
│   │   ├── main.js              # 页面逻辑、搜索、主题和文章渲染
│   │   └── style.css            # 全部样式
│   └── content/posts/           # Markdown 文章
├── package.json                 # 可选：Wrangler 部署
├── wrangler.jsonc               # Cloudflare Workers Static Assets 配置
└── README.md
```

## 本地预览

不要直接双击 `index.html`，因为浏览器会限制 Markdown 文件读取。进入项目目录后运行：

```bash
python -m http.server 5173 -d site
```

然后访问：

```text
http://localhost:5173
```

也可以使用 VS Code 的 Live Server 插件打开 `site/index.html`。

## 修改个人信息

编辑：

```text
site/assets/config.js
```

可修改姓名、简介、GitHub 地址、关注方向、项目和文章索引。SEO 标题与描述位于 `site/index.html`。

## 添加文章

第一步，在 `site/content/posts/` 中创建 Markdown 文件，例如：

```markdown
---
title: 文章标题
date: 2026-07-27
tag: 软件工程
summary: 文章摘要
readTime: 5 分钟
featured: false
---

# 文章标题

正文内容……
```

第二步，在 `site/assets/config.js` 的 `posts` 数组中添加索引：

```js
{
  slug: 'my-new-post',
  title: '文章标题',
  date: '2026-07-27',
  tag: '软件工程',
  summary: '文章摘要',
  readTime: '5 分钟',
  featured: false,
  file: './content/posts/my-new-post.md',
}
```

## 上传到 GitHub

解压后，在 `personal-site` 目录执行：

```bash
git init
git add .
git commit -m "feat: initialize personal site"
git branch -M main
git remote add origin https://github.com/Sqhh99/personal-site.git
git push -u origin main
```

如果提示远程地址已经存在：

```bash
git remote set-url origin https://github.com/Sqhh99/personal-site.git
git push -u origin main
```

## 部署到 Cloudflare

### 直接上传

在 Cloudflare 创建页面中选择 `Upload your static files`，上传 `site` 文件夹中的全部内容。

### 连接 GitHub

连接 `Sqhh99/personal-site` 后，静态输出目录填写：

```text
site
```

该项目不需要构建命令。

### Wrangler 部署

```bash
npm install
npx wrangler login
npm run deploy
```

`wrangler.jsonc` 已将静态资源目录配置为 `site`。

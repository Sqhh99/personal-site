export const siteConfig = {
  name: 'Xiao Xu',
  handle: '@Sqhh99',
  title: 'Engineering Notes',
  role: '软件工程与智能监测研发',
  intro: '关注 C++/Qt、信号处理、海洋智能监测与工程软件，把复杂问题拆解为可验证、可维护、可交付的系统。',
  location: 'China',
  github: 'https://github.com/Sqhh99',
  repository: 'https://github.com/Sqhh99/personal-site',
  email: '',
  keywords: ['C++ / Qt', 'Python', 'Signal Processing', 'Marine Technology'],
};

export const focusAreas = [
  {
    index: '01',
    title: '工程软件',
    description: '面向实际设备、协议与业务流程，构建稳定的桌面端、数据处理与可视化软件。',
    tags: ['C++', 'Qt', 'Windows', 'Architecture'],
  },
  {
    index: '02',
    title: '信号处理',
    description: '关注声学阵列、时频分析、特征提取与多传感器数据融合中的工程实现。',
    tags: ['DSP', 'Sonar', 'Array', 'Fusion'],
  },
  {
    index: '03',
    title: '智能监测',
    description: '围绕海上风电、水下设施和城市管网，研究感知、诊断、定位与运维决策。',
    tags: ['Monitoring', 'O&M', 'Inspection', 'AI'],
  },
  {
    index: '04',
    title: '边缘部署',
    description: '探索本地模型、嵌入式设备与离线环境下的轻量推理和系统集成。',
    tags: ['LLM', 'Edge', 'ESP32', 'Offline'],
  },
];

export const projects = [
  {
    title: '海上风电智能运维',
    type: '系统方向',
    description: '围绕无人机、无人船、ROV/AUV 的协同感知与任务调度，形成空—海—潜一体化运维思路。',
    status: 'Research',
    link: '#blog',
  },
  {
    title: '城市管网多源检漏',
    type: '技术方案',
    description: '融合声学、流量、压力与视觉信息，针对大口径取水管、城市主干管和分支管制定分层检漏方案。',
    status: 'Design',
    link: '#blog',
  },
  {
    title: '声学信号与阵列处理',
    type: '算法实践',
    description: '涉及波束形成、匹配滤波、时频分析与工程参数验证，关注算法结果的可解释性与复现性。',
    status: 'Lab',
    link: '#blog',
  },
];

export const posts = [
  {
    slug: 'hello-personal-site',
    title: '这个网站为什么存在',
    date: '2026-07-27',
    tag: '随笔',
    summary: '一个不依赖传统博客框架的个人技术站，从内容结构到交互逻辑都保持可控。',
    readTime: '3 分钟',
    featured: true,
    file: './content/posts/hello-personal-site.md',
  },
  {
    slug: 'engineering-first',
    title: '工程软件的第一原则：先建立可验证边界',
    date: '2026-07-25',
    tag: '软件工程',
    summary: '软件能运行并不等于系统可信，真正的工程质量来自边界、观测和验证。',
    readTime: '5 分钟',
    featured: false,
    file: './content/posts/engineering-first.md',
  },
  {
    slug: 'multi-sensor-monitoring',
    title: '智能监测不是堆叠传感器，而是建立证据链',
    date: '2026-07-22',
    tag: '智能监测',
    summary: '多源融合的价值不在于传感器数量，而在于不同证据之间能否相互约束。',
    readTime: '6 分钟',
    featured: false,
    file: './content/posts/multi-sensor-monitoring.md',
  },
  {
    slug: 'local-first-deployment',
    title: '本地优先部署：在受限环境中保留系统能力',
    date: '2026-07-18',
    tag: '边缘计算',
    summary: '离线、内网和有限算力不是例外条件，而是许多工程系统的真实运行环境。',
    readTime: '4 分钟',
    featured: false,
    file: './content/posts/local-first-deployment.md',
  },
];

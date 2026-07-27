export const SITE = {
  name: 'Xiao Xu',
  handle: '@Sqhh99',
  title: 'Xiao Xu — Engineering Notes',
  role: 'Software Engineer',
  tagline: 'Notes on realtime media, deep learning and the web',
  description:
    'Engineering notes on WebRTC and realtime media, PyTorch and deep learning, web performance and systems.',
  location: 'China',
  github: 'https://github.com/Sqhh99',
  repository: 'https://github.com/Sqhh99/personal-site',
  email: '',
} as const;

export const NAV = [
  { href: '/', label: 'Home' },
  { href: '/blog', label: 'Writing' },
  { href: '/#focus', label: 'Focus' },
  { href: '/#about', label: 'About' },
] as const;

/** The tag vocabulary. Kept in sync with the zod enum in `src/content.config.ts`. */
export const TAGS = ['WebRTC', 'PyTorch', 'Frontend', 'Systems', 'Notes'] as const;

export type Tag = (typeof TAGS)[number];

export const FOCUS_AREAS = [
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
] as const;

/**
 * Rendered on the home page only when non-empty, so real entries can be added
 * later without touching the page component.
 */
export const PROJECTS: ReadonlyArray<{
  title: string;
  type: string;
  description: string;
  status: string;
  href: string;
}> = [];

export const ABOUT = {
  lead: 'I build software where the hard part is not the feature, but the boundary — the point where code meets a network, a GPU, or somebody else’s runtime.',
  paragraphs: [
    'Most of my time goes to realtime media and machine learning systems: the kind of code where a p99 number matters more than a feature list, and where "it works on my machine" is the beginning of the investigation rather than the end of it.',
    'I write things down here because the interesting part of an engineering problem is rarely the answer. It is the constraints that made the answer necessary — and those are exactly what gets lost when you only ship the fix.',
  ],
  specs: [
    { label: 'Role', value: 'Software Engineer' },
    { label: 'Focus', value: 'Realtime media · Deep learning' },
    { label: 'Stack', value: 'TypeScript · Python · C++' },
    { label: 'Handle', value: '@Sqhh99' },
  ],
} as const;

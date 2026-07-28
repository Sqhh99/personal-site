export const SITE = {
  name: 'Sqhh99',
  handle: '@Sqhh99',
  title: 'Sqhh99',
  role: 'Software Engineer',
  tagline: 'Notes on software, systems, and engineering',
  description:
    'Writing on realtime media, deep learning, software engineering, and systems.',
  location: 'China',
  github: 'https://github.com/Sqhh99',
  repository: 'https://github.com/Sqhh99/personal-site',
  email: '',
} as const;

export const NAV = [
  { href: '/', label: 'Home' },
  { href: '/blog', label: 'Writing' },
  { href: '/brief', label: 'Briefs' },
] as const;

/** The tag vocabulary. Kept in sync with the zod enum in `src/content.config.ts`. */
export const TAGS = ['WebRTC', 'PyTorch', 'Frontend', 'Systems', 'Notes'] as const;

export type Tag = (typeof TAGS)[number];

export const PROJECTS: ReadonlyArray<{
  title: string;
  type: string;
  description: string;
  status: string;
  href: string;
}> = [];

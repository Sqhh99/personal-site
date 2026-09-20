#!/usr/bin/env node
/**
 * QA gate for one day's AI news brief.
 *
 *   npm run check:brief                    # today's brief (Asia/Shanghai)
 *   npm run check:brief -- 2026-09-20      # a specific day
 *   npm run check:brief -- --no-ai         # deterministic checks only
 *   npm run check:brief -- --json          # also dump raw answers (for tuning)
 *   npm run check:brief -- --strict        # warnings fail too
 *
 * The rules come from agents/AGENTS_AI_DAILY_BRIEF.md. Code owns the ones that
 * are rules: file shape, deep source links, a date inside the window, item
 * counts. TypeSafe (Jev) answers the ones that need reading: is the tone
 * promotional, is an unconfirmed claim hedged, does the headline overreach, is a
 * story a repeat of one the last few briefs already ran. The model returns
 * probabilities; every threshold lives in POLICY below and is applied here.
 *
 * Exit 0 on OK/WARN, 1 on FAIL (or WARN with --strict). Without
 * TYPESAFE_API_KEY, or if the API is unreachable, only the code checks run and
 * that is reported as a warning rather than a failure.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const BRIEF_DIR = join('src', 'content', 'brief');

/**
 * Thresholds, applied in code to the probabilities Jev returns. Noul values
 * are P(yes). Score values are probability-weighted positions on the rubric
 * (0..2 for a three-level rubric). Tune against --json output, not by feel.
 */
const POLICY = {
  previousDays: 3, // how many earlier briefs to compare against
  windowDays: 3, // an item must date something within this many days of the brief
  headlineCount: [3, 6],
  followupMax: 5,
  excerptChars: 420, // how much of each previous item the dedup request sees

  promotionalTone: { fail: 0.85, warn: 0.6 },
  unhedgedReport: { fail: 0.85, warn: 0.6 },
  headlineOverreach: { fail: 0.85, warn: 0.6 },
  factAnalysisBlurred: { warn: 0.7 },
  missingSource: { warn: 0.8 },
  specificity: { fail: 0.8, warn: 1.4 }, // score below these
  takeaway: { warn: 0.35 }, // P(has an engineering takeaway) below this

  nearVerbatim: 0.5, // char-bigram Jaccard with a previous item; above this is a copy
  duplicate: { repeat: 1.45, update: 0.8 }, // dedup score: >=repeat fails, >=update needs a label
  descriptionSpecific: { fail: 0.35 },
  descriptionMatches: { warn: 0.5 },
};

/** Words the brief uses to mark an item as an increment on an earlier story. */
const UPDATE_MARKERS = /增量|昨日简报|近三日|此前|前日简报|近两日|上一轮|已写|本条是/;

// ---------------------------------------------------------------------------
// CLI

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const date = dateArg ?? todayInShanghai();
const useAI = !flags.has('--no-ai');
const dumpJson = flags.has('--json');
const strict = flags.has('--strict');

function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

// ---------------------------------------------------------------------------
// Parsing. The brief is plain Markdown in a fixed shape (see the agent doc), so
// a few regexes are enough; anything that does not match is itself a finding.

async function loadBrief(day) {
  const file = join(BRIEF_DIR, `${day}.md`);
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return null;
  }
  return { day, file, ...parseBrief(raw) };
}

function parseBrief(raw) {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const frontmatter = {};
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) frontmatter[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
    }
  }
  const body = fm ? raw.slice(fm[0].length) : raw;
  const lines = body.split(/\r?\n/);

  const declared = body.match(/\*\*要闻（(\d+)[^）]*）\*\*/);
  const items = [];
  let current = null;
  for (const line of lines) {
    const head = line.match(/^\*\*(\d+)\.\s+(.+?)\*\*\s*$/);
    if (head) {
      current = { n: Number(head[1]), title: head[2].trim(), bodyLines: [], sources: [] };
      items.push(current);
      continue;
    }
    if (!current) continue;
    if (/^---\s*$/.test(line) || /^\*\*模型/.test(line)) {
      current = null;
      continue;
    }
    if (/^来源[：:]/.test(line)) {
      current.sources = parseSources(line);
      current = null; // the sources line closes the item
      continue;
    }
    if (line.trim()) current.bodyLines.push(line.trim());
  }
  for (const it of items) {
    it.body = it.bodyLines.join('\n');
    delete it.bodyLines;
  }

  const section = (label) => {
    const m = body.match(new RegExp(`^- \\*\\*${label}\\*\\*[：:](.*)$`, 'm'));
    return m ? m[1].trim() : null;
  };
  const sections = {
    model: section('模型/产品'),
    safety: section('安全/开源'),
    policy: section('政策/产业'),
  };

  const followTail = body.split(/\*\*值得跟进的链接\*\*/)[1] ?? '';
  const followups = [...followTail.matchAll(/^\d+\.\s+(https?:\/\/\S+)/gm)].map((m) => m[1]);
  const footer = lines.find((l) => /^简报基于/.test(l)) ?? null;

  return { frontmatter, body, declaredCount: declared ? Number(declared[1]) : null, items, sections, followups, footer };
}

function parseSources(line) {
  const rest = line.replace(/^来源[：:]\s*/, '');
  return rest
    .split(/\s+·\s+/)
    .map((part) => {
      const m = part.match(/^(.*?)\s*(https?:\/\/\S+)\s*$/);
      return m ? { publisher: m[1].trim() || null, url: m[2] } : { publisher: part.trim(), url: null };
    })
    .filter((s) => s.publisher || s.url);
}

// ---------------------------------------------------------------------------
// Code checks. Each finding is { level: 'fail' | 'warn', where, msg }.

function codeChecks(brief, previous) {
  const out = [];
  const fail = (where, msg) => out.push({ level: 'fail', where, msg });
  const warn = (where, msg) => out.push({ level: 'warn', where, msg });
  const { frontmatter: f, items, sections, followups, footer, declaredCount, body, day } = brief;

  // Frontmatter must match the collection schema and the filename.
  for (const key of ['title', 'description', 'date']) if (!f[key]) fail('frontmatter', `missing ${key}`);
  if (f.date && f.date !== day) fail('frontmatter', `date ${f.date} does not match filename ${day}`);
  if (f.title && !f.title.includes(day)) warn('frontmatter', `title does not contain ${day}`);
  for (const key of ['tag', 'lang', 'draft']) if (key in f) fail('frontmatter', `essay-only field "${key}"`);
  if (f.description && /^daily ai news brief/i.test(f.description)) fail('frontmatter', 'description is boilerplate');
  if (/^import\s|<[A-Z][A-Za-z]*[\s/>]/m.test(body)) fail('body', 'MDX import or JSX in a .md brief');

  // Headlines: count, declared count, sources, deep links, dates.
  const [min, max] = POLICY.headlineCount;
  if (items.length < min || items.length > max) fail('headlines', `${items.length} items, expected ${min}–${max}`);
  if (declaredCount != null && declaredCount !== items.length) fail('headlines', `header says ${declaredCount} 条, found ${items.length}`);
  const seen = new Map();
  let inherited = []; // dates a following「同日」item may refer back to
  for (const it of items) {
    const where = `#${it.n}`;
    if (!it.body) fail(where, 'no body text');
    const urls = it.sources.map((s) => s.url).filter(Boolean);
    if (urls.length === 0) fail(where, 'no source URL');
    for (const url of urls) {
      if (!isDeepLink(url)) fail(where, `source is not a deep link: ${url}`);
      if (seen.has(url) && seen.get(url) !== it.n) warn(where, `source URL also used in #${seen.get(url)}`);
      seen.set(url, it.n);
    }
    // 「同日」dates an item relative to the one before it, which the brief
    // does often; it counts as that item's date rather than as no date.
    let dates = datesIn(it.body, day);
    if (/同日|当日/.test(it.body)) dates = dates.concat(inherited);
    if (dates.length === 0) fail(where, 'body states no date (M 月 D 日 or 同日)');
    else if (!dates.some((d) => d >= 0 && d <= POLICY.windowDays)) warn(where, `no date within ${POLICY.windowDays} days of the brief (nearest: ${Math.min(...dates.map(Math.abs))}d)`);
    inherited = dates.filter((d) => d >= 0 && d <= POLICY.windowDays);

    // Copied text is a string problem, not a judgment; the model handles the
    // paraphrased repeats (see aiChecks).
    for (const b of previous) {
      for (const p of b.items) {
        const sim = similarity(it.body, p.body);
        if (sim >= POLICY.nearVerbatim) fail(where, `near-verbatim copy of ${b.day} 「${p.title.slice(0, 30)}…」 (similarity ${sim.toFixed(2)})`);
      }
    }
  }

  // Sections, follow-ups, footer.
  for (const [k, v] of Object.entries(sections)) if (v == null) fail('sections', `missing 「${{ model: '模型/产品', safety: '安全/开源', policy: '政策/产业' }[k]}」 bullet`);
  if (followups.length === 0) warn('followups', 'no 值得跟进的链接');
  if (followups.length > POLICY.followupMax) fail('followups', `${followups.length} links, max ${POLICY.followupMax}`);
  for (const url of followups) if (!isDeepLink(url)) warn('followups', `not a deep link: ${url}`);
  if (!footer) fail('footer', 'missing 「简报基于…截止…」 line');
  else if (!footer.includes(day)) warn('footer', `footer does not mention ${day}`);

  return out;
}

function isDeepLink(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, '').length > 1 || u.search.length > 1;
  } catch {
    return false;
  }
}

/** Jaccard overlap of character bigrams, ignoring whitespace and punctuation. */
function similarity(a, b) {
  const grams = (t) => {
    const s = t.replace(/[\s\p{P}\p{S}]/gu, '');
    const set = new Set();
    for (let i = 0; i + 1 < s.length; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let both = 0;
  for (const g of A) if (B.has(g)) both++;
  return both / (A.size + B.size - both);
}

/** Days between each "M 月 D 日" in the text and the brief date (positive = before the brief). */
function datesIn(text, day) {
  const [y, m0] = day.split('-').map(Number);
  const briefDate = Date.UTC(y, m0 - 1, Number(day.slice(8)));
  const out = [];
  for (const m of text.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})/g)) {
    const month = Number(m[1]);
    const dayOf = Number(m[2]);
    if (month < 1 || month > 12 || dayOf < 1 || dayOf > 31) continue;
    // A month later than the brief's is last year's (December items in a January brief).
    const year = month > m0 ? y - 1 : y;
    out.push(Math.round((briefDate - Date.UTC(year, month - 1, dayOf)) / 86_400_000));
  }
  return out;
}

// ---------------------------------------------------------------------------
// AI checks. One request per headline for its own quality, one per headline for
// dedup against the previous briefs, one for the description. Questions in a
// request run in parallel over the same state and cannot see each other.

async function aiChecks(brief, previous) {
  const { TypeSafeClient, noul, score } = await import('@typesafe-ai/sdk');
  const client = new TypeSafeClient({ timeout: 30_000 });

  const previousItems = previous.flatMap((b) =>
    b.items.map((it) => ({ date: b.day, title: it.title, body: it.body.slice(0, POLICY.excerptChars) })),
  );

  const perItem = brief.items.map(async (it) => {
    const quality = client.systemOne({
      state: {
        note: 'A headline item from a Chinese-language daily AI news brief for engineers. Item text is Chinese; company and product names may be English.',
        brief_date: brief.day,
        item: { title: it.title, body: it.body, sources: it.sources },
      },
      questions: {
        promotionalTone: noul(
          'Does `item.body` use promotional or hype language in the author’s own voice: marketing phrasing, superlatives without evidence, or enthusiasm about a product, rather than neutral reporting?',
          {
            true: 'The author praises, sells, or cheers. Quoted enthusiasm from the people in the news does not count.',
            false: 'Neutral reporting: facts, attributed statements, and sober analysis.',
          },
        ),
        unhedgedReport: noul(
          'Does `item.body` state as established fact a figure, deal, plan, or claim whose only support is anonymous sources, unnamed insiders, leaked materials, or an unconfirmed media report, without hedging it?',
          {
            true: 'At least one such claim is asserted flatly, with no hedge such as 据报道, 据知情人士, 待核实, 待官方确认, or 拒绝置评 near it.',
            false: 'Every such claim is hedged or attributed, or the item makes no such claims (official announcements, court filings, and published documents need no hedge).',
          },
        ),
        headlineOverreach: noul(
          'Does `item.title` assert anything that `item.body` does not state or support?',
          {
            true: 'The title claims a number, outcome, cause, or certainty the body does not back up, or frames a rumour as settled.',
            false: 'Everything in the title is stated in the body with the same strength.',
          },
        ),
        factAnalysisBlurred: noul(
          'Does `item.body` present the author’s own interpretation, prediction, or evaluation as if it were a reported fact, with nothing marking it as analysis?',
          {
            true: 'An opinion or forecast appears in the same register as the reported events, with no attribution and no framing such as 这是…, 对…侧, 不是…, or a named commentator.',
            false: 'Analysis is either attributed (CNN / Axios：…) or clearly framed as the brief’s own reading, and reported facts stand apart from it.',
          },
        ),
        missingSource: noul(
          'Does `item.body` attribute information to a named publisher, company, agency, court, or document whose report is not represented in `item.sources`?',
          {
            true: 'A named outlet or document is cited in the body and no entry in `item.sources` corresponds to it. Treat Chinese and English names of the same outlet (路透社 / Reuters) as the same.',
            false: 'Every named outlet or document the body relies on has a matching entry in `item.sources`, or the body cites none.',
          },
        ),
        specificity: score('How concretely does `item.body` report the event?', [
          'Vague: says something happened, or that AI advanced, without naming who did what or when.',
          'Names the actor and the action, but leaves out when it happened or what concretely changed.',
          'States who, did what, when, with concrete details (numbers, names, documents), and what it means for readers.',
        ]),
        takeaway: noul(
          'Does `item.body` include at least one sentence saying what this news means for developers, researchers, or the industry, or what to watch for next?',
          {
            true: 'There is an explicit implication or a “what to watch next” sentence aimed at the reader.',
            false: 'The item reports the event and stops.',
          },
        ),
      },
    });

    // Each question carries its own candidate. Jev indexes into an array in
    // state unreliably (probability smears onto neighbouring entries), so the
    // pair being compared is stated inside the instruction instead.
    const dedup =
      previousItems.length === 0
        ? null
        : client.systemOne({
            state: {
              note: 'A headline item from today’s Chinese-language daily AI news brief. Each question compares it with one item from an earlier day’s brief.',
              today: { date: brief.day, title: it.title, body: it.body.slice(0, POLICY.excerptChars * 2) },
            },
            questions: Object.fromEntries(
              previousItems.map((p, i) => [
                `prev${i}`,
                score(
                  {
                    question: 'Is the earlier item below reporting the same news story as `today`, and if so, does `today` add a development that came after it?',
                    earlier_item: p,
                  },
                  [
                    'Different stories. They may share companies, people, or a theme, but the event reported is not the same one.',
                    'Same story, with a new development. `today` reports something the earlier item could not have: a later event, filing, statement, number, or actor, and reads as an update.',
                    'Same story, restated. `today` re-reports what the earlier item already covered with no new development, including when the text is identical or nearly identical.',
                  ],
                ),
              ]),
            ),
          });

    const [q, d] = await Promise.all([quality, dedup]);
    return { item: it, quality: q, dedup: d };
  });

  const description = client.systemOne({
    state: {
      note: 'The list-card blurb and the headline titles of a Chinese-language daily AI news brief.',
      description: brief.frontmatter.description ?? '',
      headline_titles: brief.items.map((it) => it.title),
    },
    questions: {
      specific: noul('Does `description` name concrete developments (who, what) rather than generic boilerplate about a daily AI brief?', {
        true: 'It names at least one specific event, actor, or product from the day.',
        false: 'It could describe any day’s brief.',
      }),
      matches: noul('Does every development named in `description` correspond to one of `headline_titles`?', {
        true: 'Each topic in the description is a headline.',
        false: 'The description mentions something that is not a headline, or contradicts one.',
      }),
    },
  });

  const [items, desc] = await Promise.all([Promise.all(perItem), description]);
  return { items, description: desc, previousItems };
}

/** Apply POLICY to raw answers. Returns findings plus a compact per-item summary. */
function judgeAI(ai) {
  const out = [];
  const fail = (where, msg) => out.push({ level: 'fail', where, msg });
  const warn = (where, msg) => out.push({ level: 'warn', where, msg });
  const rows = [];
  let requests = 1;
  let tokens = ai.description.usage.input_tokens;

  const gate = (where, name, p, thr, msg) => {
    if (thr.fail != null && p >= thr.fail) fail(where, `${msg} (${name} ${p.toFixed(2)})`);
    else if (thr.warn != null && p >= thr.warn) warn(where, `${msg}? (${name} ${p.toFixed(2)})`);
  };

  for (const { item, quality, dedup } of ai.items) {
    const a = quality.answers;
    const where = `#${item.n}`;
    requests += dedup ? 2 : 1;
    tokens += quality.usage.input_tokens + (dedup?.usage.input_tokens ?? 0);

    gate(where, 'tone', a.promotionalTone.noul, POLICY.promotionalTone, 'promotional tone');
    gate(where, 'hedge', a.unhedgedReport.noul, POLICY.unhedgedReport, 'unconfirmed claim stated as fact');
    gate(where, 'title', a.headlineOverreach.noul, POLICY.headlineOverreach, 'headline overreaches the body');
    gate(where, 'analysis', a.factAnalysisBlurred.noul, POLICY.factAnalysisBlurred, 'analysis reads as reported fact');
    gate(where, 'source', a.missingSource.noul, POLICY.missingSource, 'cites an outlet not in 来源');
    const spec = a.specificity.score;
    if (spec < POLICY.specificity.fail) fail(where, `not specific (spec ${spec.toFixed(2)})`);
    else if (spec < POLICY.specificity.warn) warn(where, `could be more specific (spec ${spec.toFixed(2)}, conf ${a.specificity.confidence.toFixed(2)})`);
    if (a.takeaway.noul < POLICY.takeaway.warn) warn(where, `no engineering takeaway (takeaway ${a.takeaway.noul.toFixed(2)})`);

    // Dedup: the strongest match against any previous item decides.
    let dup = null;
    if (dedup) {
      const best = ai.previousItems
        .map((p, i) => ({ p, s: dedup.answers[`prev${i}`].score, c: dedup.answers[`prev${i}`].confidence }))
        .sort((x, y) => y.s - x.s)[0];
      if (best.s >= POLICY.duplicate.repeat) fail(where, `repeats ${best.p.date} #「${best.p.title.slice(0, 30)}…」 (dup ${best.s.toFixed(2)}, conf ${best.c.toFixed(2)})`);
      else if (best.s >= POLICY.duplicate.update && !UPDATE_MARKERS.test(item.body)) warn(where, `update of ${best.p.date} 「${best.p.title.slice(0, 30)}…」 but not labelled as 增量 (dup ${best.s.toFixed(2)})`);
      dup = best;
    }

    rows.push({
      n: item.n,
      title: item.title,
      tone: a.promotionalTone.noul,
      hedge: a.unhedgedReport.noul,
      title_over: a.headlineOverreach.noul,
      analysis: a.factAnalysisBlurred.noul,
      source: a.missingSource.noul,
      spec,
      takeaway: a.takeaway.noul,
      dup: dup ? dup.s : null,
      dupOf: dup ? `${dup.p.date}` : null,
    });
  }

  const d = ai.description.answers;
  if (d.specific.noul < POLICY.descriptionSpecific.fail) fail('frontmatter', `description is generic (specific ${d.specific.noul.toFixed(2)})`);
  if (d.matches.noul < POLICY.descriptionMatches.warn) warn('frontmatter', `description names something that is not a headline (matches ${d.matches.noul.toFixed(2)})`);

  return { findings: out, rows, requests, tokens, model: ai.description.model };
}

// ---------------------------------------------------------------------------
// Main

const brief = await loadBrief(date);
if (!brief) {
  console.error(`FAIL: ${join(BRIEF_DIR, `${date}.md`)} not found`);
  process.exit(1);
}

const allDays = (await readdir(BRIEF_DIR))
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
  .map((f) => f.slice(0, 10))
  .filter((d) => d < date)
  .sort()
  .slice(-POLICY.previousDays);
const previous = (await Promise.all(allDays.map(loadBrief))).filter(Boolean);

const findings = codeChecks(brief, previous);
let ai = null;
let aiNote = null;
if (!useAI) aiNote = 'skipped (--no-ai)';
else if (!process.env.TYPESAFE_API_KEY) {
  aiNote = 'skipped: TYPESAFE_API_KEY is not set';
  findings.push({ level: 'warn', where: 'ai', msg: aiNote });
} else {
  try {
    const raw = await aiChecks(brief, previous);
    ai = judgeAI(raw);
    findings.push(...ai.findings);
    if (dumpJson) {
      const strip = ({ item, quality, dedup }) => ({ n: item.n, quality: quality.answers, dedup: dedup?.answers ?? null });
      console.log(JSON.stringify({ model: ai.model, items: raw.items.map(strip), description: raw.description.answers, previous: raw.previousItems.map((p) => ({ date: p.date, title: p.title })) }, null, 2));
    }
  } catch (err) {
    aiNote = `unavailable: ${err?.name ?? 'Error'}: ${err?.message ?? err}`;
    findings.push({ level: 'warn', where: 'ai', msg: aiNote });
  }
}

// Report.
const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const pct = (p) => (p == null ? '  – ' : p.toFixed(2));
console.log(`brief ${date} · ${brief.items.length} headlines · previous: ${previous.map((b) => b.day.slice(5)).join(', ') || 'none'}`);
if (ai) {
  console.log(`ai    ${ai.model} · ${ai.requests} requests · ${ai.tokens.toLocaleString()} input tokens`);
  console.log('      #  tone  hedge title analy  src   spec  take   dup   title');
  for (const r of ai.rows) {
    console.log(`      ${r.n}  ${pct(r.tone)}  ${pct(r.hedge)}  ${pct(r.title_over)}  ${pct(r.analysis)}  ${pct(r.source)}  ${pct(r.spec)}  ${pct(r.takeaway)}  ${pct(r.dup)}  ${short(r.title, 34)}`);
  }
} else {
  console.log(`ai    ${aiNote}`);
}

const fails = findings.filter((f) => f.level === 'fail');
const warns = findings.filter((f) => f.level === 'warn');
for (const f of fails) console.log(`FAIL  ${f.where.padEnd(11)} ${f.msg}`);
for (const f of warns) console.log(`WARN  ${f.where.padEnd(11)} ${f.msg}`);

if (fails.length) {
  console.log(`RESULT: FAIL (${fails.length} fail, ${warns.length} warn)`);
  process.exit(1);
}
if (warns.length) {
  console.log(`RESULT: WARN (${warns.length} warn)`);
  process.exit(strict ? 1 : 0);
}
console.log('RESULT: OK');

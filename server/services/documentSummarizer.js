/**
 * Extractive Document Summarizer (offline, no API key, no model)
 *
 * PIPELINE
 *  1. Clean      : Unicode-normalize (math-italic -> plain), strip formula symbols,
 *                  re-join hyphenated line breaks.
 *  2. Sections   : short lines with no closing punctuation are treated as headings;
 *                  they start a new section and are NOT used as sentences.
 *  3. Sentences  : split on . ! ? ; bullets, numbered items, (i)(ii) items, blank
 *                  lines, and glued page breaks ("streets.Planning").
 *  4. Score      : word weight = (1 + ln tf) * ln(1 + N/df)
 *                    tf = occurrences in the whole document
 *                    df = number of sentences containing the word
 *                  sentence score = sum(distinct word weights) / length^0.5
 *                  small boosts: opening sentences, rule-like sentences (numbers, money,
 *                  "minimum", "must", "up to" ...)
 *  5. Select     : COVERAGE FIRST - best sentence from each section (highest-scoring
 *                  sections first), then fill remaining slots by overall score.
 *                  Near-duplicates are skipped; sentences are never cut in half.
 *  6. Key points : different sentences from the summary, preferring sections the
 *                  summary did not touch.
 *
 * API (unchanged):
 *   generateExtractiveSummary(text, {
 *     maxSummarySentences = 4,
 *     maxSummaryWords     = Infinity,   // budget; sentences are never truncated
 *     maxKeyPoints        = 3,
 *     coverage            = true        // set false for plain top-score selection
 *   }) -> { summary_text, key_points, word_count }
 */

const STOP_WORDS = new Set(
  `a about above after again against all am an and any are as at be because been
   before being below between both but by can cannot could did do does doing down
   during each few for from further had has have having he her here hers him his
   how i if in into is it its itself let me more most my no nor not of off on once
   only or other ought our ours out over own same she should so some such than that
   the their theirs them then there these they this those through to too under until
   up very was we were what when where which while who whom why with would you your
   yours`.split(/\s+/)
);

const BOUNDARY = '\u0001';

// Sentences that state rules: numbers, money, limits, obligations.
const RULE_RE =
  /(\d|\$|%|\busd\b|\binr\b|\b(?:minimum|maximum|at least|up to|must|shall|only|within|deadline|eligible|tier)\b)/i;

/* ------------------------------------------------------------------ */
/* Cleaning, sections, sentences                                       */
/* ------------------------------------------------------------------ */

function normalize(text) {
  return text
    .normalize('NFKC')                 // 𝑸𝒖𝒂𝒏 -> Quan
    .replace(/\r\n?/g, '\n')
    .replace(/[∑√∫]/g, ' ')
    .replace(/(\w)-\n(\w)/g, '$1$2')   // re-join hyphenated line breaks
    .replace(/[\t\f\v]+/g, ' ');
}

/**
 * Splits text into sections. A heading is a line that is much shorter than the
 * document's own typical line and has no closing punctuation, so the rule adapts
 * to different page widths and OCR layouts.
 */
function splitSections(text) {
  const lines = normalize(text).split('\n');
  const lens = lines.map(l => l.trim().length).filter(n => n > 0).sort((a, b) => a - b);
  const median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;

  const sections = [[]];
  for (const line of lines) {
    const l = line.trim();
    const isHeading =
      l.length > 0 &&
      l.length < median * 0.6 &&
      !/[.!?;,:]["')”]*$/.test(l);
    if (isHeading) sections.push([]);      // heading text itself is dropped
    else sections[sections.length - 1].push(line);
  }
  return sections.map(ls => ls.join('\n')).filter(b => b.trim().length > 0);
}

function splitBodyIntoSentences(body) {
  return ('\n' + body)
    // list markers at the start of a line: o, •, -, 1., 2), (i), iv)
    .replace(/\n[ ]*(?:[o•▪◦\-–*]|\d{1,2}[.)]|\(?[ivx]{1,4}\))[ ]+/gi, BOUNDARY)
    .replace(/\n{2,}/g, BOUNDARY)                       // blank lines
    .replace(/\n/g, ' ')                                // remaining newlines are line wraps
    .replace(/\s(?=\([ivx]{1,4}\)\s)/gi, BOUNDARY)      // inline (i) (ii) items
    .replace(/([a-z]{2}[.!?])(?=[A-Z][a-z])/g, '$1' + BOUNDARY) // "streets.Planning"
    .replace(/(?<=[.!?])\s+(?=[A-Z0-9("'“])/g, BOUNDARY)
    .replace(/(?<=;)\s+/g, BOUNDARY)
    .replace(/\s(?=Tier \d+:)/g, BOUNDARY)              // "Tier 1: ... Tier 2: ..."
    .split(BOUNDARY)
    .map(s => s.replace(/\s+/g, ' ').trim().replace(/^\(?[ivx]{1,4}\)\s+/i, '')) // drop leftover "(ii) "
    .filter(Boolean);
}

/** Returns [{ text, section }] in document order. */
function splitIntoSentences(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  splitSections(text).forEach((body, section) => {
    for (const s of splitBodyIntoSentences(body)) out.push({ text: s, section });
  });
  return out;
}

function tokenize(sentence) {
  return (sentence.toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) || [])
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

// Drops formula debris, table fragments, intro lines and unfinished fragments.
function looksLikeProse(s) {
  const letters = (s.match(/[a-z]/gi) || []).length;
  if (letters / s.length <= 0.6) return false;
  if (/=|\bf\(/.test(s) && !/\b(?:Tier|is|are)\b/.test(s)) return false; // bare formulas
  if (/:$/.test(s)) return false;                                        // intro line
  if (!/[.!?]["')”]*$/.test(s) && !/\d/.test(s)) return false;           // unfinished fragment
  return true;
}

const wordCountOf = s => s.split(/\s+/).filter(Boolean).length;

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Greedy pick from a ranked list. Skips sentences too similar to anything
 * already chosen (or in `exclude`) and ones that would bust the word budget.
 */
function pick(ranked, { maxSentences, maxWords = Infinity, exclude = [] }) {
  const chosen = [];
  const seen = exclude.map(e => e.tokenSet);
  let words = 0;

  for (const item of ranked) {
    if (chosen.length >= maxSentences) break;
    if (words + item.wordCount > maxWords) continue;   // try a shorter one instead
    if (seen.some(s => jaccard(item.tokenSet, s) > 0.5)) continue;
    chosen.push(item);
    seen.push(item.tokenSet);
    words += item.wordCount;
  }
  return chosen;
}

/**
 * Coverage-first selection:
 *   phase 1: best sentence of each section (sections ordered by their best score)
 *   phase 2: fill leftover slots by overall score
 */
function diversePick(ranked, opts) {
  const {
    maxSentences,
    maxWords = Infinity,
    maxItemWords = Infinity,
    exclude = [],
    avoidSections = new Set(),
    coverage = true
  } = opts;

  const pool = ranked.filter(i => i.wordCount <= maxItemWords);

  let phase1 = [];
  if (coverage) {
    const leaders = [];
    const seenSections = new Set();
    for (const item of pool) {
      if (avoidSections.has(item.section) || seenSections.has(item.section)) continue;
      seenSections.add(item.section);
      leaders.push(item);
    }
    phase1 = pick(leaders, { maxSentences, maxWords, exclude });
  }

  const used = phase1.reduce((n, i) => n + i.wordCount, 0);
  const phase2 = phase1.length < maxSentences
    ? pick(pool, {
        maxSentences: maxSentences - phase1.length,
        maxWords: maxWords - used,
        exclude: [...exclude, ...phase1]
      })
    : [];

  return [...phase1, ...phase2];
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export function generateExtractiveSummary(text, options = {}) {
  const maxSummarySentences = options.maxSummarySentences || 4;
  const maxSummaryWords = options.maxSummaryWords || Infinity;
  const maxKeyPoints = options.maxKeyPoints || 3;
  const coverage = options.coverage !== false;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return { summary_text: 'No text content available for summarization.', key_points: '', word_count: 0 };
  }

  const all = splitIntoSentences(text);

  if (all.length <= 2) {
    const summary = all.map(s => s.text).join(' ');
    return {
      summary_text: summary,
      key_points: all.map(s => `• ${s.text}`).join('\n'),
      word_count: wordCountOf(summary)
    };
  }

  const N = all.length;
  const tokens = all.map(s => tokenize(s.text));

  // tf over the document, df over sentences
  const tf = new Map();
  const df = new Map();
  for (const ts of tokens) {
    for (const w of ts) tf.set(w, (tf.get(w) || 0) + 1);
    for (const w of new Set(ts)) df.set(w, (df.get(w) || 0) + 1);
  }
  const weight = w => (1 + Math.log(tf.get(w))) * Math.log(1 + N / df.get(w));

  const candidates = [];
  all.forEach(({ text: sentence, section }, index) => {
    const ts = tokens[index];
    const wc = wordCountOf(sentence);
    if (wc < 5 || ts.length === 0 || !looksLikeProse(sentence)) return;

    const tokenSet = new Set(ts);
    let raw = 0;
    for (const w of tokenSet) raw += weight(w);

    let score = raw / Math.sqrt(ts.length);
    if (index < 2) score *= 1.15;                 // opening sentences
    if (RULE_RE.test(sentence)) score *= 1.2;     // rules, limits, amounts

    candidates.push({ sentence, index, section, score, wordCount: wc, tokenSet });
  });

  if (candidates.length === 0) {
    const fallback = all.slice(0, 2).map(s => s.text).join(' ');
    return {
      summary_text: fallback,
      key_points: all.slice(0, 2).map(s => `• ${s.text}`).join('\n'),
      word_count: wordCountOf(fallback)
    };
  }

  const ranked = [...candidates].sort((a, b) => b.score - a.score);

  const summaryItems = diversePick(ranked, {
    maxSentences: maxSummarySentences,
    maxWords: maxSummaryWords,
    coverage
  });
  const summaryText = summaryItems
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(i => i.sentence)
    .join(' ');

  // Key points: different sentences, short enough to scan, from sections the
  // summary did not already cover (falls back to any section if needed).
  const keyItems = diversePick(ranked, {
    maxSentences: maxKeyPoints,
    maxItemWords: 40,
    exclude: summaryItems,
    avoidSections: new Set(summaryItems.map(i => i.section)),
    coverage
  });
  const keyPointsText = keyItems
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(i => `• ${i.sentence.replace(/^[-*•\s]+/, '').trim()}`)
    .join('\n');

  return {
    summary_text: summaryText,
    key_points: keyPointsText,
    word_count: wordCountOf(summaryText)
  };
}

export default { generateExtractiveSummary };
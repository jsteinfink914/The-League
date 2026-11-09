// Question matching for the Ask page: plain-code parsing, no AI. The
// league's vocabulary is finite (16 managers, a handful of seasons and
// positions), so token scoring over each registry entry's aliases plus
// parameter extraction covers the questions people actually ask.
// Anything the matcher can't place returns null and the page says so —
// it never guesses a number.

export const normalizeText = (text) => ` ${(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;

const POSITION_WORDS = {
    QB: ['qb', 'qbs', 'quarterback', 'quarterbacks'],
    RB: ['rb', 'rbs', 'running back', 'running backs', 'runningback'],
    WR: ['wr', 'wrs', 'wide receiver', 'wide receivers', 'receiver', 'receivers'],
    TE: ['te', 'tes', 'tight end', 'tight ends'],
};

// Pull the parameters a question can carry out of the raw text.
// seasonsDesc: the seasons the site has data for, newest first.
export const extractParams = (text, { seasonsDesc = [], managerNames = [] } = {}) => {
    const norm = normalizeText(text);
    const raw = (text || '').toLowerCase();
    const params = {};

    if (/\b(all time|alltime|ever|history|historical|career)\b/.test(norm)) {
        params.season = 'all';
    } else {
        const yearMatch = norm.match(/\b(20\d{2})\b/);
        if (yearMatch && seasonsDesc.includes(Number(yearMatch[1]))) {
            params.season = Number(yearMatch[1]);
        }
    }

    for (const name of managerNames) {
        if (name && norm.includes(` ${name.toLowerCase()} `)) {
            params.manager = name;
            break;
        }
    }

    for (const [pos, words] of Object.entries(POSITION_WORDS)) {
        if (words.some((w) => norm.includes(` ${w} `) || norm.includes(` ${w}s `))) {
            params.pos = pos;
            break;
        }
    }

    const topMatch = raw.match(/\btop\s+(\d{1,2})\b/);
    if (topMatch) params.topN = Math.max(1, Math.min(50, Number(topMatch[1])));

    // The + is stripped by normalizeText, so read thresholds off the raw text.
    const threshMatch = raw.match(/\b(\d{1,3})\s*\+/);
    if (threshMatch) params.threshold = Number(threshMatch[1]);

    return params;
};

// Score every entry against the question and return the best match.
// An entry scores for each of its aliases found in the text (longer
// aliases count more — they're more specific) and for each keyword hit.
export const matchEntry = (entries, text, ctx = {}) => {
    const norm = normalizeText(text);
    if (norm.trim().length < 3) return null;
    const params = extractParams(text, ctx);
    let best = null;
    for (const entry of entries) {
        let score = 0;
        for (const alias of entry.aliases || []) {
            const a = normalizeText(alias);
            if (a.trim() && norm.includes(a)) score += 10 + a.trim().length;
        }
        for (const kw of entry.keywords || []) {
            if (norm.includes(` ${kw.toLowerCase()} `)) score += 4;
        }
        if (score > 0 && (!best || score > best.score)) {
            best = { entry, params, score };
        }
    }
    return best;
};

// The closest entries even when nothing clears the bar — used for
// "did you mean" suggestions on a miss.
export const closestEntries = (entries, text, ctx = {}, n = 3) => {
    const norm = normalizeText(text);
    return entries
        .map((entry) => {
            let score = 0;
            const words = new Set(norm.split(' ').filter(Boolean));
            for (const alias of entry.aliases || []) {
                for (const w of normalizeText(alias).split(' ').filter(Boolean)) {
                    if (words.has(w)) score += 1;
                }
            }
            return { entry, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, n)
        .map((r) => r.entry);
};

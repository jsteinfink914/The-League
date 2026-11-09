// Question matching for the Ask page: plain-code parsing, no AI. The
// league's vocabulary is finite (16 managers, a handful of seasons and
// positions), so token scoring over each registry entry's aliases plus
// parameter extraction covers the questions people actually ask.
// Anything the matcher can't place returns null and the page says so —
// it never guesses a number.

export const normalizeText = (text) => ` ${(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;

// Light singularization so "drafts" and "draft" (and "players"/"player")
// count as the same word in token and keyword matching — without it,
// "who drafts well" scored zero against the drafting entry. Phrase
// matching still runs on the raw normalized text.
const stemWord = (w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

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
// Scoring: a full alias phrase in the text is the strongest signal; an
// alias whose words ALL appear (any order) is nearly as strong — that's
// what makes "best at drafting" or "drafting, who's best" land. Keyword
// hits add a little. Ties prefer computed answers over guides over
// plain page links.
const KIND_PRIORITY = { query: 3, guide: 2, page: 1 };

export const matchEntry = (entries, text, ctx = {}) => {
    const norm = normalizeText(text);
    if (norm.trim().length < 3) return null;
    const words = new Set(norm.split(' ').filter(Boolean).map(stemWord));
    const params = extractParams(text, ctx);
    let best = null;
    for (const entry of entries) {
        let phraseScore = 0;
        let tokenScore = 0;
        for (const alias of entry.aliases || []) {
            const a = normalizeText(alias).trim();
            if (!a) continue;
            if (norm.includes(a)) {
                phraseScore += 10 + a.length;
            } else {
                const aliasWords = a.split(' ').filter(Boolean);
                if (aliasWords.length > 1 && aliasWords.every((w) => words.has(stemWord(w)))) {
                    tokenScore += 8 + a.length;
                }
            }
        }
        let keywordScore = 0;
        for (const kw of entry.keywords || []) {
            if (words.has(stemWord(kw.toLowerCase()))) keywordScore += 4;
        }
        // A contiguous alias phrase is a much stronger signal than
        // scattered words: any entry with a phrase hit outranks every
        // token-only entry (that's what keeps "most fantasy points" on
        // the player leaderboard instead of the team one).
        const score = phraseScore > 0 ? 1000 + phraseScore + keywordScore : tokenScore + keywordScore;
        if (score > 0) {
            const better = !best || score > best.score
                || (score === best.score && (KIND_PRIORITY[entry.kind] || 0) > (KIND_PRIORITY[best.entry.kind] || 0));
            if (better) best = { entry, params, score };
        }
    }
    return best;
};

// One conversational turn. A clear new intent (a real alias hit) starts
// a fresh question. A fragment carrying only parameters ("what about
// 2024?", "top 5", "and for RBs?") re-runs the previous entry with the
// new parameters merged in — that's what makes it feel like a chat
// instead of a search box.
const NEW_INTENT_MIN = 1000;

export const resolveTurn = (entries, text, ctx = {}, last = null) => {
    const match = matchEntry(entries, text, ctx);
    if (match && match.score >= NEW_INTENT_MIN) return { ...match, followUp: false };
    if (last) {
        const params = extractParams(text, ctx);
        if (Object.keys(params).length > 0) {
            return { entry: last.entry, params: { ...last.params, ...params }, score: match?.score || 0, followUp: true };
        }
    }
    return match ? { ...match, followUp: false } : null;
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

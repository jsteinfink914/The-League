// Support for the LLM routes (/api/ask routing, /api/ask/narrate
// narration). The model never sees raw site data and never originates
// numbers: it picks registry entries + parameters, and when it writes
// prose it may only restate figures the registry computed (enforced
// by narrationIsGrounded). Everything here is pure and testable; the
// server routes wrap it around the provider call.

export const buildCatalog = (entries) => entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    blurb: e.blurb,
    ...(e.kind === 'query' ? { params: e.params || [], asksLike: e.examples || [] } : {}),
}));

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

// Sanitize whatever the model returned into a safe pick, or null.
export const validatePick = (raw, entries, managerNames = []) => {
    if (!raw || typeof raw !== 'object') return null;
    const entry = entries.find((e) => e.id === raw.entryId);
    if (!entry) return null;
    const p = (raw.params && typeof raw.params === 'object') ? raw.params : {};
    const params = {};
    if (p.season === 'all') params.season = 'all';
    else if (Number.isInteger(p.season) && p.season >= 2000 && p.season <= 2100) params.season = p.season;
    if (POSITIONS.includes(p.pos)) params.pos = p.pos;
    if (Number.isFinite(p.topN)) params.topN = Math.max(1, Math.min(50, Math.round(p.topN)));
    if (Number.isFinite(p.threshold)) params.threshold = Math.max(1, Math.min(200, Math.round(p.threshold)));
    if (typeof p.manager === 'string' && managerNames.includes(p.manager)) params.manager = p.manager;
    // Only keep params the entry actually accepts.
    const allowed = new Set(entry.params || []);
    for (const k of Object.keys(params)) if (!allowed.has(k)) delete params[k];
    return { entry, params };
};

export const ROUTER_SYSTEM_PROMPT = `You route questions for a fantasy football league stats site. Given a user question and a catalog of entries, pick the entry (or entries) that answer it and extract their parameters.

Rules:
- Respond with ONLY a JSON object: {"picks": [{"entryId": "<id>", "params": {...}}]} — one pick normally, or {"picks": []} if nothing fits.
- Return 2 or 3 picks ONLY when the question compares people/topics or clearly asks for more than one stat (for example "who is luckier and who drafts better"). Otherwise exactly one pick.
- params may include only the keys listed for that entry: season (a 4-digit year, or "all" for all-time), manager (an exact manager name from the question), pos ("QB"|"RB"|"WR"|"TE"), topN (an integer), threshold (an integer).
- If the question names a year, set season to that year on every pick that accepts it. If it says all-time/ever, set season to "all" where accepted.
- Prefer a computed (kind "query") entry whenever the question asks for a stat, a ranking, a comparison, or who is best/worst at something. Pick a "page" or "guide" entry only when the user asks to see, open, or find that page.
- Never invent statistics, names, or numbers. Your only job is choosing entries and their parameters.`;

// Validate the router's answer into 1-3 safe picks. Accepts the
// current {"picks": [...]} shape and the legacy single-pick shape.
export const validatePicks = (raw, entries, managerNames = []) => {
    if (!raw || typeof raw !== 'object') return [];
    const list = Array.isArray(raw.picks) ? raw.picks : (raw.entryId ? [raw] : []);
    const seen = new Set();
    const picks = [];
    for (const item of list) {
        const pick = validatePick(item, entries, managerNames);
        if (pick && !seen.has(pick.entry.id)) {
            seen.add(pick.entry.id);
            picks.push(pick);
        }
        if (picks.length >= 3) break;
    }
    return picks;
};

export const NARRATE_SYSTEM_PROMPT = `You write a one or two sentence summary of computed fantasy football league stats for a chat answer.

Rules:
- Use ONLY the names and numbers in the results provided. Never invent, estimate, round beyond a whole number, or compute new figures (no differences, percentages, or averages of your own).
- Mention the leader or the compared names and their actual figures. Plain text, no markdown, no preamble like "Based on the data".
- If multiple results are provided, cover each briefly or compare them.`;

// Every standalone digit-string in a text, normalized (commas
// dropped). Digits glued to letters ("RB1", "QB12") are labels,
// not figures, and don't count on either side.
const numbersIn = (text) => [...String(text || '').matchAll(/(?<![A-Za-z0-9])\d[\d,]*\.?\d*(?![A-Za-z])/g)]
    .map((m) => parseFloat(m[0].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));

// Narration may only restate figures the computed results contain.
// A prose number passes if it matches a source figure, allowing
// whole-number rounding (325.90 may be written as 326, not as 400).
export const narrationIsGrounded = (text, sourceText) => {
    const allowed = numbersIn(sourceText);
    return numbersIn(text).every((n) => allowed.some((a) => Math.abs(a - n) < 0.6));
};

// Fill any parameter the router left out with the value the local
// extractor read straight from the question text. A year or a
// position named in the question is unambiguous text — the model
// occasionally drops it, the extractor doesn't. Router values win
// on conflict.
export const mergeExtractedParams = (pickParams = {}, extracted = {}) => {
    const merged = { ...pickParams };
    for (const [k, v] of Object.entries(extracted)) {
        if (merged[k] === undefined && v !== undefined) merged[k] = v;
    }
    return merged;
};

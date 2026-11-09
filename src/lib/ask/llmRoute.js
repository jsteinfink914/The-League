// Support for the optional LLM routing fallback (/api/ask). The model
// never sees site data and never produces numbers: it only picks a
// registry entry id and extracts parameters. Everything here is pure
// and testable; the server route wraps it around the provider call.

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

export const ROUTER_SYSTEM_PROMPT = `You route questions for a fantasy football league stats site. Given a user question and a catalog of entries, pick the single best entry and extract its parameters.

Rules:
- Respond with ONLY a JSON object: {"entryId": "<id>", "params": {...}} or {"entryId": null} if nothing fits.
- params may include only the keys listed for that entry: season (a 4-digit year, or "all" for all-time), manager (an exact manager name from the question), pos ("QB"|"RB"|"WR"|"TE"), topN (an integer), threshold (an integer).
- Prefer a computed (kind "query") entry whenever the question asks for a stat, a ranking, a comparison, or who is best/worst at something. Pick a "page" or "guide" entry only when the user asks to see, open, or find that page.
- Never invent statistics, names, or numbers. Your only job is choosing the entry and its parameters.`;

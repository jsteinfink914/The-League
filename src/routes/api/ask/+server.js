import { json } from '@sveltejs/kit';
import { ENTRIES } from '$lib/ask/registry';
import { managers as leagueManagers } from '$lib/utils/leagueInfo';
import { buildCatalog, buildDatasetCatalog, pickOutcome, buildRoutePrompt, ROUTER_SYSTEM_PROMPT } from '$lib/ask/llmRoute';
import { DATASETS } from '$lib/ask/datasets';

// Optional freeform routing for the Ask chat. When ASK_LLM_KEY is set,
// questions the local matcher can't place are sent to a small model
// that may only pick a registry entry + parameters (validated here) —
// the answers themselves are still computed by the registry's own
// functions in the browser. Without a key this returns not_configured
// and the chat falls back to its honest miss.
export async function POST({ request }) {
    const key = process.env.ASK_LLM_KEY || '';
    if (!key) return json({ ok: false, reason: 'not_configured' });

    const body = await request.json().catch(() => ({}));
    const question = String(body.question || '').slice(0, 500).trim();
    if (!question) return json({ ok: false, reason: 'empty' });
    const rawCtx = (body.context && typeof body.context === 'object') ? body.context : null;
    const context = rawCtx && (ENTRIES.some((e) => e.id === rawCtx.entryId) || DATASETS.some((d) => rawCtx.entryId === `dataset:${d.id}`))
        ? { entryId: rawCtx.entryId, headline: String(rawCtx.headline || '').slice(0, 200) }
        : null;

    const base = (process.env.ASK_LLM_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = process.env.ASK_LLM_MODEL || 'gpt-4o-mini';
    const managerNames = leagueManagers.map((m) => m.name);

    // One provider call, parsed. Returns null on an upstream error
    // (already logged); throws only on malformed JSON.
    const callRouter = async () => {
        const res = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            // A slow model must degrade to the local matcher, not hang
            // the question until the platform kills the function.
            signal: AbortSignal.timeout(20000),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model,
                temperature: 0,
                messages: [
                    { role: 'system', content: ROUTER_SYSTEM_PROMPT },
                    { role: 'user', content: buildRoutePrompt(question, { entries: buildCatalog(ENTRIES), datasets: buildDatasetCatalog(DATASETS) }, managerNames, context) },
                ],
            }),
        });
        if (!res.ok) {
            const detail = (await res.text().catch(() => '')).slice(0, 300);
            console.error('ask router upstream error', res.status, detail);
            return null;
        }
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || '';
        return JSON.parse(text.replace(/```json|```/g, '').trim());
    };

    try {
        let parsed = await callRouter();
        if (!parsed) return json({ ok: false, reason: 'llm_error' });
        let outcome = pickOutcome(parsed, ENTRIES, DATASETS, managerNames);
        if (!outcome) {
            // The model occasionally returns an empty answer for a
            // question that plainly fits (measured ~1 in 5 on some
            // phrasings at temperature 0). One retry makes that rare;
            // errors and timeouts are NOT retried — they degrade to
            // the local matcher as before.
            console.log('ask router: empty outcome, retrying once');
            parsed = await callRouter();
            if (parsed) outcome = pickOutcome(parsed, ENTRIES, DATASETS, managerNames);
        }
        if (!outcome) return json({ ok: false, reason: 'no_match' });
        if (outcome.plan) return json({ ok: true, plan: outcome.plan });
        return json({ ok: true, picks: outcome.picks });
    } catch (e) {
        console.error('ask router failed', e);
        return json({ ok: false, reason: 'llm_error' });
    }
}

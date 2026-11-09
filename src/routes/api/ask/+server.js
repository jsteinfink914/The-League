import { json } from '@sveltejs/kit';
import { ENTRIES } from '$lib/ask/registry';
import { managers as leagueManagers } from '$lib/utils/leagueInfo';
import { buildCatalog, validatePick, ROUTER_SYSTEM_PROMPT } from '$lib/ask/llmRoute';

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

    const base = (process.env.ASK_LLM_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = process.env.ASK_LLM_MODEL || 'gpt-4o-mini';
    try {
        const res = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model,
                temperature: 0,
                messages: [
                    { role: 'system', content: ROUTER_SYSTEM_PROMPT },
                    { role: 'user', content: `Catalog:\n${JSON.stringify(buildCatalog(ENTRIES))}\n\nManagers: ${leagueManagers.map((m) => m.name).join(', ')}\n\nQuestion: ${question}` },
                ],
            }),
        });
        if (!res.ok) return json({ ok: false, reason: 'llm_error' });
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || '';
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        const pick = validatePick(parsed, ENTRIES, leagueManagers.map((m) => m.name));
        if (!pick) return json({ ok: false, reason: 'no_match' });
        return json({ ok: true, entryId: pick.entry.id, params: pick.params });
    } catch {
        return json({ ok: false, reason: 'llm_error' });
    }
}

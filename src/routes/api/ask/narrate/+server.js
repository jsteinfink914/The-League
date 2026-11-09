import { json } from '@sveltejs/kit';
import { NARRATE_SYSTEM_PROMPT, narrationIsGrounded } from '$lib/ask/llmRoute';

// Narration for Ask answers: the model writes one or two sentences
// ABOUT results the registry already computed in the browser. It
// receives only those results (headline + top rows), and its prose
// is returned only if every number in it appears in the results —
// the model phrases numbers, it never originates them. Any failure
// returns ok:false and the chat shows the plain tables instead.
export async function POST({ request }) {
    const key = process.env.ASK_LLM_KEY || '';
    if (!key) return json({ ok: false, reason: 'not_configured' });

    const body = await request.json().catch(() => ({}));
    const question = String(body.question || '').slice(0, 500).trim();
    const rawResults = Array.isArray(body.results) ? body.results.slice(0, 3) : [];
    const results = rawResults.map((r) => ({
        headline: String(r?.headline || '').slice(0, 300),
        note: String(r?.note || '').slice(0, 300),
        rows: (Array.isArray(r?.rows) ? r.rows : []).slice(0, 8).map((row) => ({
            label: String(row?.label || '').slice(0, 120),
            value: String(row?.value || '').slice(0, 60),
            sub: String(row?.sub || '').slice(0, 120),
        })),
    })).filter((r) => r.headline || r.rows.length);
    if (!results.length) return json({ ok: false, reason: 'empty' });

    const sourceText = results.map((r) => [
        r.headline,
        ...r.rows.map((row) => `${row.label}: ${row.value}${row.sub ? ` (${row.sub})` : ''}`),
        r.note,
    ].join('\n')).join('\n\n');

    const base = (process.env.ASK_LLM_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = process.env.ASK_LLM_MODEL || 'gpt-4o-mini';
    try {
        const res = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            signal: AbortSignal.timeout(20000),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model,
                temperature: 0.3,
                messages: [
                    { role: 'system', content: NARRATE_SYSTEM_PROMPT },
                    { role: 'user', content: `Question: ${question}\n\nComputed results:\n${sourceText}` },
                ],
            }),
        });
        if (!res.ok) {
            console.error('ask narrate upstream error', res.status, (await res.text().catch(() => '')).slice(0, 300));
            return json({ ok: false, reason: 'llm_error' });
        }
        const data = await res.json();
        const text = String(data?.choices?.[0]?.message?.content || '')
            .replace(/```[a-z]*|```/g, '')
            .trim()
            .slice(0, 500);
        if (!text) return json({ ok: false, reason: 'empty' });
        if (!narrationIsGrounded(text, `${question}\n${sourceText}`)) {
            console.error('ask narrate dropped ungrounded prose', text);
            return json({ ok: false, reason: 'ungrounded' });
        }
        return json({ ok: true, text });
    } catch (e) {
        console.error('ask narrate failed', e);
        return json({ ok: false, reason: 'llm_error' });
    }
}

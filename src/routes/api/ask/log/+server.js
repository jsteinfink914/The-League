import { json } from '@sveltejs/kit';
import pool from '$lib/server/db.js';

// Turn log for the Ask chat: one row per question — what was asked,
// which registry entry answered (null on a miss), which route produced
// it (local matcher / follow-up / LLM router / miss), and the answer
// headline. Written fire-and-forget by the chat; read back to find the
// phrasings the matcher still can't place. No identity is attached —
// the site has no logins, so a row is just a question and its outcome.
const ensureTable = () => pool.query(`
    CREATE TABLE IF NOT EXISTS ask_log (
        id BIGSERIAL PRIMARY KEY,
        asked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        question TEXT NOT NULL,
        entry_id TEXT,
        via TEXT NOT NULL,
        headline TEXT
    )
`);

const VIAS = ['local', 'followup', 'llm', 'miss'];

export async function POST({ request }) {
    try {
        const body = await request.json();
        const question = String(body?.question || '').slice(0, 500);
        if (!question) return json({ ok: false, error: 'question required' }, { status: 400 });
        const via = VIAS.includes(body?.via) ? body.via : 'local';
        const entryId = body?.entryId ? String(body.entryId).slice(0, 80) : null;
        const headline = body?.headline ? String(body.headline).slice(0, 300) : null;
        await ensureTable();
        await pool.query(
            'INSERT INTO ask_log (question, entry_id, via, headline) VALUES ($1, $2, $3, $4)',
            [question, entryId, via, headline],
        );
        return json({ ok: true });
    } catch (e) {
        return json({ ok: false, error: e.message }, { status: 500 });
    }
}

export async function GET({ url }) {
    try {
        await ensureTable();
        const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 100));
        const missesOnly = url.searchParams.get('misses') === '1';
        const { rows } = await pool.query(
            `SELECT id, asked_at, question, entry_id, via, headline FROM ask_log
             ${missesOnly ? "WHERE via = 'miss'" : ''} ORDER BY id DESC LIMIT $1`,
            [limit],
        );
        return json(rows);
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}

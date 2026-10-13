import { json } from '@sveltejs/kit';
import pool from '$lib/server/db.js';

export async function POST({ request }) {
    try {
        const { endpoint } = await request.json();
        if (!endpoint) return json({ error: 'endpoint required' }, { status: 400 });
        await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
        return json({ ok: true });
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}

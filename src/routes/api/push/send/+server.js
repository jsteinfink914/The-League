import { json } from '@sveltejs/kit';
import webpush from 'web-push';
import pool from '$lib/server/db.js';

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    subscription JSONB NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
)`;

// Sends a push notification to every subscribed browser.
// Gated by PUSH_SECRET so only the league's own watcher can trigger it.
// Body: { secret, title, body, url? }
export async function POST({ request }) {
    try {
        const { secret, title, body, url } = await request.json();
        if (!process.env.PUSH_SECRET || secret !== process.env.PUSH_SECRET) {
            return json({ error: 'unauthorized' }, { status: 401 });
        }
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        if (!publicKey || !privateKey) {
            return json({ error: 'push not configured' }, { status: 503 });
        }
        webpush.setVapidDetails('mailto:jsteinfink914@gmail.com', publicKey, privateKey);

        await pool.query(CREATE_TABLE);
        const { rows } = await pool.query('SELECT endpoint, subscription FROM push_subscriptions');
        const payload = JSON.stringify({ title: title || 'The League', body: body || '', url: url || '/' });

        let sent = 0;
        const dead = [];
        await Promise.all(rows.map(async ({ endpoint, subscription }) => {
            try {
                const sub = typeof subscription === 'string' ? JSON.parse(subscription) : subscription;
                await webpush.sendNotification(sub, payload);
                sent++;
            } catch (e) {
                // 404/410 = subscription expired or revoked; prune it.
                if (e.statusCode === 404 || e.statusCode === 410) dead.push(endpoint);
            }
        }));
        if (dead.length) {
            await pool.query('DELETE FROM push_subscriptions WHERE endpoint = ANY($1)', [dead]);
        }
        return json({ ok: true, sent, pruned: dead.length, total: rows.length });
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}

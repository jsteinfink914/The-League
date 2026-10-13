import { json } from '@sveltejs/kit';
import pool from '$lib/server/db.js';

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    subscription JSONB NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
)`;

// Registers (or updates) one browser's push subscription.
export async function POST({ request }) {
    try {
        const { subscription, label } = await request.json();
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return json({ error: 'invalid subscription' }, { status: 400 });
        }
        await pool.query(CREATE_TABLE);
        await pool.query(
            `INSERT INTO push_subscriptions (endpoint, subscription, label)
             VALUES ($1, $2, $3)
             ON CONFLICT (endpoint) DO UPDATE SET subscription = EXCLUDED.subscription, label = EXCLUDED.label`,
            [subscription.endpoint, JSON.stringify(subscription), label || null]
        );
        return json({ ok: true });
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}

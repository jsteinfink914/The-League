import { json } from '@sveltejs/kit';
import pool from '$lib/server/db.js';
import { sendPush } from '$lib/server/webpush.js';

// POST { title, message } -> sends a web push to every subscriber.
// Gated by the shared PUSH_SECRET so only the league watcher can trigger it.
export async function POST({ request }) {
	const secret = process.env.PUSH_SECRET || '';
	if (!secret || request.headers.get('x-push-secret') !== secret) {
		return json({ error: 'forbidden' }, { status: 403 });
	}
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'bad json' }, { status: 400 });
	}
	const { title = 'The League', message = '', url = '/' } = body;
	if (!message) return json({ error: 'message required' }, { status: 400 });

	const { rows } = await pool.query('SELECT endpoint, subscription FROM push_subscriptions');
	// Device payload matches what static/sw.js reads: { title, body, url }.
	const payload = JSON.stringify({ title, body: message, url });
	let sent = 0;
	let pruned = 0;
	for (const row of rows) {
		const sub =
			typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
		try {
			const status = await sendPush(sub, payload);
			if (status === 404 || status === 410) {
				await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
				pruned++;
			} else if (status < 400) {
				sent++;
			}
		} catch (e) {
			console.error('push failed for', row.endpoint, e.message);
		}
	}
	return json({ sent, pruned, total: rows.length });
}

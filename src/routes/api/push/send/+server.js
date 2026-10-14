import { json } from '@sveltejs/kit';
import pool from '$lib/server/db.js';
import { sendPush, vapidJwt } from '$lib/server/webpush.js';

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

	const { rows } = await pool.query('SELECT endpoint, subscription FROM push_subscriptions');
	// ?dryRun=1: return what WOULD be sent (endpoint host, decoded JWT claims)
	// without actually sending. For debugging auth rejections.
	if (new URL(request.url).searchParams.get('dryRun') === '1') {
		return json({
			subscriptions: rows.map((row) => {
				const sub =
					typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
				const { token, pubKeyB64 } = vapidJwt(sub.endpoint);
				const [h, p] = token.split('.');
				let claims = null;
				try {
					claims = JSON.parse(Buffer.from(p, 'base64url').toString());
				} catch {}
				return {
					endpointHost: (() => { try { return new URL(sub.endpoint).host; } catch { return '?'; } })(),
					endpointPreview: sub.endpoint.slice(0, 60) + '...',
					jwtHeader: h,
					claims,
					kLength: pubKeyB64.length,
					kPreview: pubKeyB64.slice(0, 12) + '...'
				};
			})
		});
	}
	if (!message) return json({ error: 'message required' }, { status: 400 });
	// Device payload matches what static/sw.js reads: { title, body, url }.
	const payload = JSON.stringify({ title, body: message, url });
	let sent = 0;
	let pruned = 0;
	const details = [];
	for (const row of rows) {
		const sub =
			typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
		const host = (() => { try { return new URL(sub.endpoint).host; } catch { return '?'; } })();
		try {
			const { status, bodyText } = await sendPush(sub, payload);
			details.push({ host, status, bodyText: (bodyText || '').slice(0, 200) });
			if (status === 404 || status === 410) {
				await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
				pruned++;
			} else if (status < 400) {
				sent++;
			}
		} catch (e) {
			details.push({ host, status: 'error', error: e.message });
			console.error('push failed for', row.endpoint, e.message);
		}
	}
	return json({ sent, pruned, total: rows.length, details });
}

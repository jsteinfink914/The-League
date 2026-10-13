import { json } from '@sveltejs/kit';
import { getVapidKeys } from '$lib/server/webpush.js';

// Returns the VAPID public key so browsers can subscribe for push.
// The private key never leaves the server; the public key is derived from it.
export async function GET() {
	try {
		const { pub } = getVapidKeys();
		return json({ publicKey: Buffer.from(pub).toString('base64url') });
	} catch {
		return json({ error: 'push not configured' }, { status: 503 });
	}
}

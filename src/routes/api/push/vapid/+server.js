import { json } from '@sveltejs/kit';

// Returns the VAPID public key so browsers can subscribe for push.
// The private key never leaves the server.
export async function GET() {
    const publicKey = process.env.VAPID_PUBLIC_KEY || '';
    if (!publicKey) return json({ error: 'push not configured' }, { status: 503 });
    return json({ publicKey });
}

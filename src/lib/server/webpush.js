// Minimal Web Push sender (RFC 8291 aes128gcm + RFC 8292 VAPID) using only node:crypto.
// Intentionally dependency-free so package-lock.json never needs to change.
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url');

// HKDF-Extract(salt, ikm) = HMAC-SHA256(key=salt, msg=ikm); empty salt -> 32 zero bytes.
function hkdfExtract(salt, ikm) {
	const s = salt && salt.length ? Buffer.from(salt) : Buffer.alloc(32, 0);
	return crypto.createHmac('sha256', s).update(ikm).digest();
}

// HKDF-Expand(prk, info, L) per RFC 5869.
function hkdfExpand(prk, info, L) {
	const infoBuf = Buffer.from(info);
	let t = Buffer.alloc(0);
	let okm = Buffer.alloc(0);
	for (let i = 1; okm.length < L; i++) {
		t = crypto.createHmac('sha256', prk)
			.update(Buffer.concat([t, infoBuf, Buffer.from([i])]))
			.digest();
		okm = Buffer.concat([okm, t]);
	}
	return okm.subarray(0, L);
}

// DER-encoded ECDSA signature (from crypto.sign) -> raw R||S for JWS.
function derToJose(der) {
	let o = 0;
	if (der[o++] !== 0x30) throw new Error('bad DER signature');
	let len = der[o++];
	if (len & 0x80) {
		const n = len & 0x7f;
		len = 0;
		for (let i = 0; i < n; i++) len = (len << 8) | der[o++];
	}
	if (der[o++] !== 0x02) throw new Error('bad DER signature');
	const rLen = der[o++];
	let r = der.subarray(o, o + rLen);
	o += rLen;
	if (der[o++] !== 0x02) throw new Error('bad DER signature');
	const sLen = der[o++];
	let s = der.subarray(o, o + sLen);
	const pad32 = (b) =>
		b.length > 32 ? b.subarray(b.length - 32) : Buffer.concat([Buffer.alloc(32 - b.length, 0), b]);
	return Buffer.concat([pad32(r), pad32(s)]);
}

export function getVapidKeys() {
	const priv = unb64(process.env.VAPID_PRIVATE_KEY || '');
	if (priv.length !== 32) throw new Error('VAPID_PRIVATE_KEY not configured');
	const ecdh = crypto.createECDH('prime256v1');
	ecdh.setPrivateKey(priv);
	return { priv, pub: ecdh.getPublicKey() }; // pub: 65-byte uncompressed
}

// Build the VAPID JWT for a push endpoint. Returns { token, pubKeyB64 }.
export function vapidJwt(endpoint) {
	const { priv, pub } = getVapidKeys();
	// NB: use protocol + host (NOT .origin): .origin strips default ports,
	// but the push service may expect the aud with the port as-given, and
	// the reference web-push library uses protocol + '//' + host.
	const u = new URL(endpoint);
	const aud = `${u.protocol}//${u.host}`;
	const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
	const payload = b64u(
		JSON.stringify({
			aud,
			exp: Math.floor(Date.now() / 1000) + 12 * 3600,
			sub: 'mailto:league-page-push@localhost'
		})
	);
	const unsigned = `${header}.${payload}`;
	const jwk = {
		kty: 'EC',
		crv: 'P-256',
		x: b64u(pub.subarray(1, 33)),
		y: b64u(pub.subarray(33, 65)),
		d: b64u(priv)
	};
	const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
	const der = crypto.sign('sha256', Buffer.from(unsigned), key);
	return { token: `${unsigned}.${b64u(derToJose(der))}`, pubKeyB64: b64u(pub) };
}

// Encrypt a payload for a subscription per RFC 8291 (aes128gcm, single record).
// subscription = { endpoint, keys: { p256dh, auth } } (base64url strings)
export function encryptPush(subscription, payloadText) {
	const clientPub = unb64(subscription.keys.p256dh); // 65-byte uncompressed P-256
	const authSecret = unb64(subscription.keys.auth); // 16 bytes
	if (clientPub.length !== 65 || authSecret.length !== 16) throw new Error('bad subscription keys');
	const payload = Buffer.from(payloadText, 'utf8');

	const salt = crypto.randomBytes(16);
	const ecdh = crypto.createECDH('prime256v1');
	ecdh.generateKeys();
	const ephPub = ecdh.getPublicKey(); // 65 bytes
	const sharedSecret = ecdh.computeSecret(clientPub);

	// RFC 8291 §3.4
	const prkKey = hkdfExtract(authSecret, sharedSecret);
	const keyInfo = Buffer.concat([Buffer.from('WebPush: info'), Buffer.from([0]), clientPub, ephPub]);
	const ikm = hkdfExpand(prkKey, keyInfo, 32);

	// RFC 8291 §4 (aes128gcm)
	const prk = hkdfExtract(salt, ikm);
	const cek = hkdfExpand(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm'), Buffer.from([0])]), 16);
	const nonce = hkdfExpand(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce'), Buffer.from([0])]), 12);

	// Single record: 0x02 delimiter || payload (no padding)
	const plaintext = Buffer.concat([Buffer.from([0x02]), payload]);
	const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
	const ct = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

	// Body: salt(16) || rs(4, BE, 4096) || idlen(1) || keyid(ephPub) || ciphertext+tag
	const rs = Buffer.alloc(4);
	rs.writeUInt32BE(4096, 0);
	return Buffer.concat([salt, rs, Buffer.from([ephPub.length]), ephPub, ct]);
}

// Encrypt + POST a push. Returns { status, bodyText } from the push service.
export async function sendPush(subscription, payloadText) {
	const { token, pubKeyB64 } = vapidJwt(subscription.endpoint);
	const body = encryptPush(subscription, payloadText);
	const res = await fetch(subscription.endpoint, {
		method: 'POST',
		headers: {
			TTL: '86400',
			'Content-Type': 'application/octet-stream',
			'Content-Encoding': 'aes128gcm',
			Authorization: `vapid t=${token}, k=${pubKeyB64}`
		},
		body,
		signal: AbortSignal.timeout(15000)
	});
	const bodyText = await res.text().catch(() => '');
	return { status: res.status, bodyText };
}

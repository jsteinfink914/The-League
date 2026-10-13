<script>
    import { onMount } from 'svelte';

    let state = 'checking'; // checking | unsupported | ios-install | off | subscribing | on | blocked | error
    let errorMsg = '';

    function urlBase64ToUint8Array(base64) {
        const padding = '='.repeat((4 - (base64.length % 4)) % 4);
        const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(b64);
        return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
    }

    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    }

    onMount(async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            state = 'unsupported';
            return;
        }
        // iOS only delivers web push to home-screen-installed web apps (16.4+).
        if (isIOS() && !isStandalone()) {
            state = 'ios-install';
            return;
        }
        try {
            // Register here too (idempotent): layout registers on mount, but
            // child onMount can run first, and serviceWorker.ready would hang
            // forever if registration hasn't started yet.
            await navigator.serviceWorker.register('/sw.js');
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            state = sub ? 'on' : 'off';
        } catch (e) {
            state = 'error';
            errorMsg = e.message;
        }
    });

    async function subscribe() {
        state = 'subscribing';
        try {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') {
                state = 'blocked';
                return;
            }
            const keyRes = await fetch('/api/push/vapid');
            const { publicKey } = await keyRes.json();
            if (!publicKey) throw new Error('push not configured on server yet');
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
            const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: sub.toJSON() }),
            });
            if (!res.ok) throw new Error('server rejected subscription');
            state = 'on';
        } catch (e) {
            state = 'error';
            errorMsg = e.message;
        }
    }

    async function unsubscribe() {
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await fetch('/api/push/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: sub.endpoint }),
                });
                await sub.unsubscribe();
            }
            state = 'off';
        } catch (e) {
            state = 'error';
            errorMsg = e.message;
        }
    }
</script>

{#if state === 'off' || state === 'subscribing'}
    <div class="push-banner">
        <span>🔔 Get league alerts (cap violations, big trades) as push notifications.</span>
        <button on:click={subscribe} disabled={state === 'subscribing'}>
            {state === 'subscribing' ? 'Enabling…' : 'Enable alerts'}
        </button>
    </div>
{:else if state === 'on'}
    <div class="push-banner quiet">
        <span>🔔 League alerts on.</span>
        <button class="link" on:click={unsubscribe}>turn off</button>
    </div>
{:else if state === 'ios-install'}
    <div class="push-banner">
        <span>🔔 On iPhone: add this site to your Home Screen first, then open it from there to enable league alerts.</span>
    </div>
{:else if state === 'blocked'}
    <div class="push-banner quiet">
        <span>🔕 Notifications are blocked for this site — allow them in your browser settings to get league alerts.</span>
    </div>
{/if}

<style>
    .push-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
        margin: 0 auto 18px;
        padding: 10px 18px;
        max-width: 620px;
        background: var(--eee, #f4f4f4);
        border-radius: 10px;
        font-size: 0.9em;
    }
    .push-banner.quiet { font-size: 0.8em; opacity: 0.8; }
    .push-banner button {
        cursor: pointer;
        padding: 6px 14px;
        border-radius: 8px;
        border: none;
        background: #1d4ed8;
        color: #fff;
        font-weight: 600;
    }
    .push-banner button:disabled { opacity: 0.6; cursor: default; }
    .push-banner button.link {
        background: none;
        color: inherit;
        text-decoration: underline;
        padding: 0;
        font-weight: 400;
    }
</style>

<!-- __layout.svelte -->
<script>
	import { Nav, Footer } from "$lib/components"
	import { onMount } from "svelte";

	onMount(() => {
		// Register the service worker for web push notifications.
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js').catch(() => {});
		}
	});
</script>

<main>
    <Nav /> <!-- adds the nav (small and large) -->
  
    <slot />

    <Footer /> <!-- adds the footer -->
</main>
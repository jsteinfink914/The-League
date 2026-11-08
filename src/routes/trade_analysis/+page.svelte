<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    onMount(() => goto(`/trade_analysis/team${window.location.search}`, { replaceState: true }));
</script>

<p>Loading…</p>

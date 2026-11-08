<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    onMount(() => goto(`/cap_analysis/allocation${window.location.search}`, { replaceState: true }));
</script>

<p>Loading…</p>

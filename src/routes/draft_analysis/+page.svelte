<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    onMount(() => goto(`/draft_analysis/team${window.location.search}`, { replaceState: true }));
</script>

<p>Loading…</p>

<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    onMount(() => goto(`/manager_overview/leaderboard${window.location.search}`, { replaceState: true }));
</script>

<p>Loading…</p>

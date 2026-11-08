<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    // /h2h is the Luck tab's route; this just forwards, keeping any
    // query string so shared links land intact.
    onMount(() => goto(`/h2h/luck${window.location.search}`, { replaceState: true }));
</script>

<p>Loading…</p>

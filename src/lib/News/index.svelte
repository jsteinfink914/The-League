<script>
	import SingleNews from "./SingleNews.svelte"
	import Pagination from "../Pagination.svelte"
    import { getNews } from "$lib/utils/helper";
	import { onMount } from 'svelte';

    export let news;
    let {articles, fresh, partial = false, failedSources = []} = news;

	onMount(async () => {
        if(!fresh) {
            getFreshNews();
        }
	});

    const getFreshNews = async () => {
        const newNews = await getNews(null, true);
        articles = newNews.articles;
        partial = newNews.partial;
        failedSources = newNews.failedSources;
    }

    const perPage = 10;
    let total = 0;
    let page = 0;
    let displayArticles = [];

    const calculateTotal = (a) => {
        total = a.length;
    }

    $: calculateTotal(articles);

    const changePage = (dest) => {
        const start = dest * perPage;
        const end = (dest + 1) * perPage;
        displayArticles = articles.slice(start, end);
        page = dest;
    }

    $: changePage(page);

    let el;

    $: top = el?.getBoundingClientRect() ? el?.getBoundingClientRect().top  : 0;
</script>

<style>
    .pageBody {
        position: relative;
        z-index: 1;
        margin-bottom: 60px;
    }

    h4 {
        text-align: center;
    }

    .articles {
        width: 85%;
        margin: 0 auto;
        max-width: 800px;
    }

    .partial {
        width: 85%;
        max-width: 800px;
        margin: 1rem auto;
        padding: .75rem;
        border: 1px solid #c58b00;
        border-radius: 4px;
        background: #fff7df;
        color: #6b4a00;
    }

    :global(.article) {
        margin: 20px auto;
    }
</style>

<div class="pageBody">
    <div class="banner" bind:this={el}>
        <h4>Fantasy Football News and Updates</h4>
    </div>
    {#if partial}
        <p class="partial" role="status">
            Some news sources are temporarily unavailable ({failedSources.join(', ') || 'unknown source'}). Available stories are still shown; refresh to retry.
        </p>
    {/if}

    <div class="articles">
        {#each displayArticles as article}
            <SingleNews {article} />
        {/each}
        <Pagination {perPage} {total} bind:page={page} target={top} />
    </div>
</div>
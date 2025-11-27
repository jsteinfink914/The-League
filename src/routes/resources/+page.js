import { getNews } from '$lib/utils/helper';

export async function load({fetch}) {
    const articlesData = await getNews(fetch);

    return {
        articlesData
    };
}
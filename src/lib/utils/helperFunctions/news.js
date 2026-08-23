import { get } from 'svelte/store';
import {news} from '$lib/stores';

const SERVER_API = '/api/fetch_serverside_news';

export const getNews = async (servFetch, bypass = false) => {
	if(get(news)[0] && !bypass) {
		return {articles: get(news), fresh: false};
	}
    const smartFetch = servFetch ?? fetch;
	let articles = [];
	try {
		const serverRes = await smartFetch(SERVER_API, {compress: true});
		if (!serverRes.ok) {
			throw new Error(`News service responded with ${serverRes.status}`);
		}
		const serverData = await serverRes.json();
		articles = Array.isArray(serverData) ? serverData : [];
	} catch (error) {
		console.warn('News service is unavailable:', error);
	}
	articles.sort((a, b) => (a.ts < b.ts) ? 1 : -1);
	news.update(() => articles);

	return {articles, fresh: true};
}

export const stringDate = (d) => {
	return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${d.getHours() % 12}:${(d.getMinutes() < 10 ? '0' : '') + d.getMinutes()}${d.getHours() / 12 >= 1 ? "PM" : "AM"}`;
}

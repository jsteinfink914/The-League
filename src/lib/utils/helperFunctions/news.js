import { fetchJson, allSettledWithConcurrency } from './request';
import { get } from 'svelte/store';
import {news} from '$lib/stores';
const SERVER_API = '/api/fetch_serverside_news';

export const getNews = async (servFetch, bypass = false) => {
	const cachedNews = get(news);
	if(cachedNews.articles?.length && !bypass) {
		return {...cachedNews, fresh: false};
	}
    const smartFetch = servFetch ?? fetch;
const results = await allSettledWithConcurrency([
  () => fetchJson(SERVER_API, { compress: true }, { fetcher: smartFetch })
], 1);
const serverResult = results[0];
const serverPayload = serverResult.status === 'fulfilled' ? serverResult.value : [];
const serverData = Array.isArray(serverPayload)
  ? serverPayload
  : Array.isArray(serverPayload?.articles)
    ? serverPayload.articles
    : [];
	const articles = serverData.sort((a, b) => (a.ts < b.ts) ? 1 : -1);
 if (articles.length) {
   news.update(() => ({
     articles,
     partial: results.some((result) => result.status === 'rejected') || Boolean(serverPayload?.partial),
     failedSources: results
        .map((result) => result.status === 'rejected' ? 'news feeds' : null)
       .filter(Boolean)
       .concat(serverPayload?.failedSources || [])
   }));
 }

return {
  articles,
  fresh: true,
  partial: results.some((result) => result.status === 'rejected') || Boolean(serverPayload?.partial),
  failedSources: results
    .map((result) => result.status === 'rejected' ? 'news feeds' : null)
    .filter(Boolean)
    .concat(serverPayload?.failedSources || [])
};
}

const getFeed = async (feed, callback, fetcher) => {
const data = await fetchJson(feed, { compress: true }, { fetcher });
if (data && data.data) return callback(data.data);
throw new Error('News feed returned an invalid response.');
}

const processReddit = (rawArticles) => {
	const bannedAuthors = [
		"AutoModerator",
		"FFBot",
		"Brookskbrothers",
		"FTAKJ"
	]
	const bannedIcons = [
		"",
		"self",
		"thumbnail",
		"default",
	]
	let finalArticles = [];
	const children = rawArticles.children;
	for(const rawArticle of children) {
		const data = rawArticle.data;
		if(bannedAuthors.includes(data.author)) {
			continue;
		}
		const ts = data.created_utc * 1000;
		const d = new Date(ts);
		const icon = !bannedIcons.includes(data.thumbnail) ? data.thumbnail : `newsIcons/${data.subreddit}.png`;
		const date = stringDate(d);
		let article = `<a href="${data.url}" class="body-link">${data.url}</a>`;
		if(data.selftext_html) {
			article = decodeHTML(data.selftext_html);
		}
		if(data.secure_media_embed?.content) {
			decodeHTML(data.secure_media_embed.content)
		 }
		finalArticles.push({
			title: data.title,
			article,
			link: `https://www.reddit.com${data.permalink}`,
			author: `${data.subreddit_name_prefixed} - u/${data.author}`,
			ts,
			date,
			icon,
		});
	}
	return finalArticles;
}

var htmlEntities = {
    nbsp: ' ',
    cent: '¢',
    pound: '£',
    yen: '¥',
    euro: '€',
    copy: '©',
    reg: '®',
    lt: '<',
    gt: '>',
    quot: '"',
    amp: '&',
    apos: '\''
};

function decodeHTML(str) {
    return str.replace(/\&([^;]+);/g, function (entity, entityCode) {
        let match;

        if (entityCode in htmlEntities) {
            return htmlEntities[entityCode];
            /*eslint no-cond-assign: 0*/
        } else if (match = entityCode.match(/^#x([\da-fA-F]+)$/)) {
            return String.fromCharCode(parseInt(match[1], 16));
            /*eslint no-cond-assign: 0*/
        } else if (match = entityCode.match(/^#(\d+)$/)) {
            return String.fromCharCode(~~match[1]);
        } else {
            return entity;
        }
    });
}

export const stringDate = (d) => {
	return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${d.getHours() % 12}:${(d.getMinutes() < 10 ? '0' : '') + d.getMinutes()}${d.getHours() / 12 >= 1 ? "PM" : "AM"}`;
}
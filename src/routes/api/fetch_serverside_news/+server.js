import {XMLParser, XMLValidator} from 'fast-xml-parser';
import { dynasty } from '$lib/utils/helper';
import { json } from '@sveltejs/kit';

const FF_BALLERS= 'https://thefantasyfootballers.libsyn.com/fantasyfootball';
const DYNASTY_LEAGUE= 'https://dynastyleaguefootball.com/feed/';
const DYNASTY_NERDS= 'https://www.dynastynerds.com/feed/';
const REDDIT_DYNASTY = 'https://www.reddit.com/r/DynastyFF/new.json';
const REDDIT_FANTASY = 'https://www.reddit.com/r/fantasyfootball/new.json';

export async function GET() {
	const articles = [getXMLArticles(FF_BALLERS, processFF)];
    const sourceNames = ['Fantasy Footballers'];
	if(dynasty) {
		articles.push(getXMLArticles(DYNASTY_LEAGUE, processDynastyLeague));
		articles.push(getXMLArticles(DYNASTY_NERDS, processDynastyNerds));
        sourceNames.push('Dynasty League', 'Dynasty Nerds');
	}
    articles.push(getJsonArticles(dynasty ? REDDIT_DYNASTY : REDDIT_FANTASY, processReddit));
    sourceNames.push('Reddit');
    const responses = await Promise.allSettled(articles);
    const successful = responses
      .filter((response) => response.status === 'fulfilled')
      .flatMap((response) => response.value);
    return json({
      articles: successful,
      partial: responses.some((response) => response.status === 'rejected'),
      failedSources: responses
        .map((response, index) => response.status === 'rejected' ? sourceNames[index] : null)
        .filter(Boolean)
    });
}

const getXMLArticles = async(url, callback) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(url, { compress: true, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`RSS request failed (${res.status}).`);
    const text = await res.text();

    let xmlData;
    if(XMLValidator.validate(text) === true){
        const parser = new XMLParser();
        xmlData = parser.parse(text);
    }
    const items = xmlData?.rss?.channel?.item;
    if (!items) throw new Error('RSS feed did not contain articles.');
    return callback(Array.isArray(items) ? items : [items]);
}

const getJsonArticles = async (url, callback) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch(url, {
        headers: { 'User-Agent': 'League Page news reader' },
        signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`News request failed (${response.status}).`);
    const payload = await response.json();
    if (!payload?.data) throw new Error('News source returned an invalid response.');
    return callback(payload.data);
};

const processFF = (articles) => {
	let finalArticles = [];
	for(const article of articles.slice(0, 5)) {
		const ts = Date.parse(article.pubDate);
		const d = new Date(ts);
		const date = stringDate(d);
		const icon = 'newsIcons/ffballers.jpeg';
		finalArticles.push({
title: cleanText(article.title),
article: cleanText(article.description),
			link: article.link,
			author: `Fantasy Footballers`,
			ts,
			date,
			icon,
		});
	}
	return finalArticles;
}

const processFTN = (rawArticles) => {
	let finalArticles = [];
	const items = rawArticles.items;
	for(const article of items) {
		// only grab important info
		if(article.priority > 3) continue;
		const ts = Date.parse(article.datetime);
		const d = new Date(ts);
		const date = stringDate(d);
		const icon = 'newsIcons/ftn.png';
		finalArticles.push({
title: cleanText(article.short_text),
article: cleanText(article.text),
			link: `https://www.ftnfantasy.com/nfl${article.link}`,
			author: `FTN Fantasy`,
			ts,
			date,
			icon,
		});
	}
	return finalArticles;
}

const processDynastyLeague = (articles) => {
	let finalArticles = [];
	for(const article of articles) {
		const ts = Date.parse(article.pubDate);
		const d = new Date(ts);
		const date = stringDate(d);
		const icon = 'newsIcons/dynastyLeague.png';
		finalArticles.push({
title: cleanText(article.title),
article: cleanText(article.description),
			link: article.link,
			author: `Dynasty League Football`,
			ts,
			date,
			icon,
		});
	}
	return finalArticles;
}

const processDynastyNerds = (articles) => {
	let finalArticles = [];
	for(const article of articles) {
		const ts = Date.parse(article.pubDate);
		const d = new Date(ts);
		const date = stringDate(d);
		const icon = 'newsIcons/dynastyNerds.jpeg';
		finalArticles.push({
title: cleanText(article.title),
article: cleanText(article.description),
			link: article.link,
			author: `Dynasty Nerds`,
			ts,
			date,
			icon,
		});
	}
	return finalArticles;
}

const processReddit = (rawArticles) => (rawArticles.children ?? [])
    .map((entry) => entry.data)
    .filter((article) => article && !['AutoModerator', 'FFBot', 'Brookskbrothers', 'FTAKJ'].includes(article.author))
    .map((article) => {
        const ts = article.created_utc * 1000;
        return {
            title: cleanText(article.title),
            article: cleanText(article.selftext_html || article.url),
            link: `https://www.reddit.com${article.permalink}`,
            author: `${article.subreddit_name_prefixed} - u/${article.author}`,
            ts,
            date: stringDate(new Date(ts)),
            icon: ['self', 'thumbnail', 'default', ''].includes(article.thumbnail)
                ? `newsIcons/${article.subreddit}.png`
                : article.thumbnail
        };
    });

const stringDate = (d) => {
	return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:${(d.getMinutes() < 10 ? '0' : '') + d.getMinutes()}`;
}

const cleanText = (value) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
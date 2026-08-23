import {XMLParser, XMLValidator} from 'fast-xml-parser';
import { dynasty } from '$lib/utils/helper';
import { json } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/utils/helperFunctions/network';

const FF_BALLERS= 'https://thefantasyfootballers.libsyn.com/fantasyfootball';
const DYNASTY_LEAGUE= 'https://dynastyleaguefootball.com/feed/';
const DYNASTY_NERDS= 'https://www.dynastynerds.com/feed/';
const REDDIT_DYNASTY = 'https://www.reddit.com/r/DynastyFF/new.json';
const REDDIT_FANTASY = 'https://www.reddit.com/r/fantasyfootball/new.json';

export async function GET() {
	const articles = [
        getXMLArticles(FF_BALLERS, processFF),
	];
	if(dynasty) {
		articles.push(getXMLArticles(DYNASTY_LEAGUE, processDynastyLeague));
		articles.push(getXMLArticles(DYNASTY_NERDS, processDynastyNerds));
	}
    articles.push(getJsonArticles(dynasty ? REDDIT_DYNASTY : REDDIT_FANTASY, processReddit));
    const responses = await Promise.allSettled(articles);
	let finalArticles = responses.flatMap((response) => {
		if (response.status === 'fulfilled') return response.value;
		console.warn('News source unavailable:', response.reason);
		return [];
	});

    return json(finalArticles);
}

const getXMLArticles = async(url, callback) => {
    try {
        const res = await fetchWithTimeout(url, {compress: true});
        const text = await res.text();
        if (XMLValidator.validate(text) !== true) {
            throw new Error('News source returned invalid XML');
        }
        const parser = new XMLParser({ processEntities: false });
        const xmlData = parser.parse(text);
        const items = xmlData?.rss?.channel?.item;
        if (!items) return [];
        return callback(Array.isArray(items) ? items : [items]);
    } catch (error) {
        console.warn(`Unable to load news source ${url}:`, error);
        return [];
    }
}

const getJsonArticles = async(url, callback) => {
    try {
        const res = await fetchWithTimeout(url, {
            headers: { 'User-Agent': 'League Page news reader' },
            compress: true
        });
        const data = await res.json();
        return data?.data ? callback(data.data) : [];
    } catch (error) {
        console.warn(`Unable to load news source ${url}:`, error);
        return [];
    }
}

const processFF = (articles) => {
	let finalArticles = [];
	for(const article of articles.slice(0, 5)) {
		const ts = Date.parse(article.pubDate);
		const d = new Date(ts);
		const date = stringDate(d);
		const icon = 'newsIcons/ffballers.jpeg';
		finalArticles.push({
			title: article.title,
			article: toPlainText(article.description),
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
			title: article.short_text,
			article: toPlainText(article.text),
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
			title: article.title,
			article: toPlainText(article.description),
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
			title: article.title,
			article: toPlainText(article.description),
			link: article.link,
			author: `Dynasty Nerds`,
			ts,
			date,
			icon,
		});
	}
	return finalArticles;
}

const processReddit = (rawArticles) => {
    const bannedAuthors = ['AutoModerator', 'FFBot', 'Brookskbrothers', 'FTAKJ'];
    const bannedIcons = ['', 'self', 'thumbnail', 'default'];

    return (rawArticles.children ?? [])
        .map((rawArticle) => rawArticle.data)
        .filter((article) => article && !bannedAuthors.includes(article.author))
        .map((article) => {
            const ts = article.created_utc * 1000;
            return {
                title: article.title,
                article: article.selftext_html ? toPlainText(article.selftext_html) : article.url,
                link: `https://www.reddit.com${article.permalink}`,
                author: `${article.subreddit_name_prefixed} - u/${article.author}`,
                ts,
                date: stringDate(new Date(ts)),
                icon: !bannedIcons.includes(article.thumbnail) ? article.thumbnail : `newsIcons/${article.subreddit}.png`
            };
        });
}

const stringDate = (d) => {
	return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:${(d.getMinutes() < 10 ? '0' : '') + d.getMinutes()}`;
}

const toPlainText = (value) => String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
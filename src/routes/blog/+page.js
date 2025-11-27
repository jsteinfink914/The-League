
import { enableBlog, getBlogPosts, getLeagueTeamManagers } from '$lib/utils/helper';

export async function load({ url, fetch }) {
    if(!enableBlog) return false;

    const queryPage = url?.searchParams?.get('page') || 1;
    const filterKey = url?.searchParams?.get('filter') || '';
    const postsData = await getBlogPosts(fetch);
    const leagueTeamManagersData = await getLeagueTeamManagers();

    return {
        queryPage,
        postsData,
        filterKey,
        leagueTeamManagersData,
    };
}
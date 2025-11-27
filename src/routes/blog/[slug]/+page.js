
import { enableBlog, getBlogPosts, getLeagueTeamManagers } from '$lib/utils/helper';

export async function load({ fetch, params }) {
    if(!enableBlog) return false;
    
    const postID = params.slug;
    const postsData = await getBlogPosts(fetch);
    const leagueTeamManagersData = await getLeagueTeamManagers();

    return {
        postsData,
        postID,
        leagueTeamManagersData,
    };
}
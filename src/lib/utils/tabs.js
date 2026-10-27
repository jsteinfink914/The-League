import {leagueID} from '$lib/utils/leagueInfo';

export const tabs = [
    {
        icon: 'home',
        label: 'Home',
        dest: '/',
    },
    {
        icon: 'sports',
        label: 'Matchups',
        dest: '/matchups',
    },
    {
        icon: 'swap_horiz',
        label: 'Trades & Waivers',
        dest: '/transactions',
    },
    {
        icon: 'view_comfy',
        label: 'League',
        nest: true,
        children: [
            {
                icon: 'storage',
                label: 'Rosters',
                dest: '/rosters',
            },
            {
                icon: 'leaderboard',
                label: 'Standings',
                dest: '/standings',
            },
            {
                icon: 'local_fire_department',
                label: 'Rivalry',
                dest: '/rivalry',
            },
        ]
    },
    {
        icon: 'attach_money',
        label: 'Cap',
        nest: true,
        children: [
            {
                icon: 'attach_money',
                label: 'Player Values',
                dest: '/cap',
            },
            {
                icon: 'money',
                label: 'Team Values',
                dest: '/team_values',
            },
            {
                icon: 'swap_horiz',
                label: 'Cap Trade Calculator',
                dest: '/calculator',
            },
        ]
    },
    {
        icon: 'analytics',
        label: 'Analytics',
        nest: true,
        children: [
            {
                icon: 'compare_arrows',
                label: 'Trade Analysis',
                dest: '/trade_analysis',
            },
            {
                icon: 'format_list_numbered',
                label: 'Draft Analysis',
                dest: '/draft_analysis',
            },
            {
                icon: 'analytics',
                label: 'Cap Analysis',
                dest: '/cap_analysis',
            },
            {
                icon: 'emoji_people',
                label: 'Manager Overview',
                dest: '/manager_overview',
            },
        ]
    },
    {
        icon: 'history_edu',
        label: 'History',
        nest: true,
        children: [
            {
                icon: 'view_comfy',
                label: 'Drafts',
                dest: '/drafts',
            },
            {
                icon: 'military_tech',
                label: 'Records',
                dest: '/records',
            },
            {
                icon: 'emoji_events',
                label: 'Trophy Room',
                dest: '/awards',
            },
        ]
    },
    {
        icon: 'gavel',
        label: 'Commish',
        nest: true,
        children: [
            {
                icon: 'toll',
                label: 'Lottery',
                dest: '/lottery',
            },
            {
                icon: 'calendar_month',
                label: 'Schedule',
                dest: '/schedule',
            },
            {
                icon: 'history_edu',
                label: 'Constitution',
                dest: '/constitution',
            },
            {
                icon: 'swap_horiz',
                label: 'Conditional Trades',
                dest: '/conditional',
            },
        ]
    },
    {
        icon: 'more_horiz',
        label: 'More',
        nest: true,
        children: [
            {
                icon: 'article',
                label: 'Blog',
                dest: '/blog',
            },
            {
                icon: 'lightbulb',
                label: 'Resources',
                dest: '/resources',
            },
            {
                icon: 'casino',
                label: 'Side Bets',
                dest: '/sidebets',
            },
            {
                icon: 'sports_football',
                label: 'Go to Sleeper',
                dest: `https://sleeper.app/leagues/${leagueID}`,
            },
        ]
    },
];

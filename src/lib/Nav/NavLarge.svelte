<script>
	import Tab, { Icon, Label } from '@smui/tab';
	import List, { Item, Graphic, Text, Separator } from '@smui/list';
	import TabBar from '@smui/tab-bar';
	import { goto, preloadData } from '$app/navigation';
	import { enableBlog } from '$lib/utils/leagueInfo';

	export let active, tabs;
	export let currentPath = '';

	let activeTab = active;

	// Which group's submenu is open (tab label), or null when all closed.
	let openLabel = null;
	// Anchor elements for each nest tab, keyed by tab label, for submenu positioning.
	let anchors = {};

	let width, height, left, top;

	const visibleChildren = (tab) =>
		(tab?.children || []).filter((c) => c.label != 'Blog' || enableBlog);

	$: openTab = tabs.find((t) => t.nest && t.label === openLabel) || null;
	$: openChildren = visibleChildren(openTab);

	const sizeSubMenu = () => {
		const el = openLabel ? anchors[openLabel] : null;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		top = rect.bottom;
		height = rect.height;
		left = rect.left;
		width = rect.width;
	};

	let innerWidth;
	$: if (innerWidth && openLabel) sizeSubMenu();

	const close = () => {
		openLabel = null;
		setTimeout(() => {
			active = activeTab;
		}, 500);
	};

	const toggleGroup = (tab) => {
		if (openLabel === tab.label) {
			close();
		} else {
			if (!openLabel) activeTab = active;
			openLabel = tab.label;
			// wait a tick so the submenu renders, then position it
			setTimeout(sizeSubMenu, 0);
		}
	};

	const subGoto = (dest) => {
		openLabel = null;
		goto(dest);
	};

	const closeOnEscape = (event) => {
		if (event.key === 'Escape' && openLabel) {
			close();
		}
	};
</script>

<svelte:window bind:innerWidth on:keydown={closeOnEscape} />

<style>
    :global(.navBar) {
		display: inline-flex;
		position: relative;
    	justify-content: center;
    }

	:global(.navBar .material-icons) {
		font-size: 1.8em;
		height: 25px;
		width: 22px;
	}

	.parent {
		position: relative;
	}

	.subMenu {
		overflow-y: hidden;
		display: block;
		position: absolute;
		z-index: 5;
		background-color: var(--fff);
		transition: all 0.4s;
	}

	.overlay {
		display: block;
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		height: 100vh;
		z-index: 4;
	}

	:global(.mdc-deprecated-list) {
		padding: 0;
	}

	:global(.subText) {
		font-size: 0.8em;
	}

	:global(.dontDisplay) {
		display: none;
	}
</style>

<button
	class="overlay"
	type="button"
	aria-label="Close navigation menu"
	tabindex={openLabel ? 0 : -1}
	style="display: {openLabel ? 'block' : 'none'};"
	on:click={close}
/>

<div class="parent">
	<TabBar class="navBar" {tabs} let:tab bind:active>
		{#if tab.nest}
			<div bind:this={anchors[tab.label]}>
				<Tab
					{tab}
					aria-expanded={openLabel === tab.label}
					aria-controls="submenu-{tab.label}"
					on:click={() => toggleGroup(tab)}
					minWidth
				>
					<Icon class="material-icons">{tab.icon}</Icon>
					<Label>{tab.label}</Label>
				</Tab>
			</div>
		{:else}
			<Tab
				{tab}
				on:touchstart={() => preloadData(tab.dest)}
				on:mouseover={() => preloadData(tab.dest)}
				on:click={() => goto(tab.dest)}
				minWidth
			>
				<Icon class="material-icons">{tab.icon}</Icon>
				<Label>{tab.label}</Label>
			</Tab>
		{/if}
	</TabBar>
	{#if openTab}
	<div id="submenu-{openTab.label}" class="subMenu" style="max-height: {49 * openChildren.length - 1}px; min-width: {Math.max(width || 0, 200)}px; top: {height}px; left: {left}px; box-shadow: 0 0 3px 0 #00316b; border: 1px solid #00316b; border-top: none;">
		<List>
			{#each openChildren as subTab, ix}
				<Item activated={currentPath === subTab.dest} on:SMUI:action={() => subGoto(subTab.dest)} on:touchstart={() => {if(subTab.label != 'Go to Sleeper') preloadData(subTab.dest)}} on:mouseover={() => {if(subTab.label != 'Go to Sleeper') preloadData(subTab.dest)}}>
					<Graphic class="material-icons">{subTab.icon}</Graphic>
					<Text class="subText">{subTab.label}</Text>
				</Item>
				{#if ix != openChildren.length - 1}
					<Separator />
				{/if}
			{/each}
		</List>
	</div>
	{/if}
</div>

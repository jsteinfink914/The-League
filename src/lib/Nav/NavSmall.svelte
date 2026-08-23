<script>
	import Drawer, {
	  Content,
	  Header,
	  Title,
	} from '@smui/drawer';
	import { Icon } from '@smui/tab';
  	import List, { Item, Text, Graphic, Separator, Subheader } from '@smui/list';
	import { goto, preloadData } from '$app/navigation';
	import { leagueName } from '$lib/utils/helper';
	import { enableBlog, managers } from '$lib/utils/leagueInfo';
	
	export let active, tabs;

	let open = false;
	let menuButton;

	const selectTab = (event, tab) => {
		if (tab.dest.startsWith('/')) {
			event.preventDefault();
			goto(tab.dest);
		}
		open = false;
		setTimeout(() => menuButton?.focus(), 0);
	};

	const isActive = (tab) => active === tab.dest;

	const closeOnEscape = (event) => {
		if (event.key === 'Escape' && open) {
			open = false;
			setTimeout(() => menuButton?.focus(), 0);
		}
	};
</script>

<svelte:window on:keydown={closeOnEscape} />

<style>
	.menuButton {
		position: absolute;
		top: 15px;
		left: 15px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		color: #888;
		padding: 6px;
		border: 0;
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
	}

	.menuButton:hover,
	.menuButton:focus-visible {
		color: #00316b;
		background: rgba(0, 49, 107, 0.08);
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}

	:global(.nav-drawer) {
		z-index: 5;
		top: 0;
		left: 0;
	}

	:global(.nav-item) {
		color: #858585 !important;
	}

	.nav-back {
		position: fixed;
		z-index: 4;
		width: 100%;
		width: 100vw;
		height: 100%;
		height: 100vh;
		top: 0;
		left: 0;
		background-color: rgba(0, 0, 0, 0.32);
		transition: all 0.7s;
	}
</style>

<button
	class="menuButton"
	type="button"
	aria-label="Open navigation menu"
	aria-controls="mobile-navigation"
	aria-expanded={open}
	bind:this={menuButton}
	on:click={() => (open = true)}
>
	<Icon class="material-icons">menu</Icon>
</button>

<button
	class="nav-back"
	type="button"
	aria-label="Close navigation menu"
	tabindex={open ? 0 : -1}
	style="pointer-events: {open ? "auto" : "none"}; opacity: {open ? 1 : 0};"
	on:click={() => (open = false)}
/>

<Drawer id="mobile-navigation" variant="modal" class="nav-drawer" fixed={true} bind:open>
	<Header>
		<Title>{leagueName}</Title>
	</Header>
	<Content>
		<List>
			{#each tabs as tab}
				{#if !tab.nest && (tab.label != 'Blog' || (tab.label == 'Blog' && enableBlog))}
					<Item href={tab.dest} on:click={(event) => selectTab(event, tab)} on:touchstart={() => preloadData(tab.dest)} on:mouseover={() => preloadData(tab.dest)} activated={isActive(tab)} >
						<Graphic class="material-icons{isActive(tab) ? "" : " nav-item"}" aria-hidden="true">{tab.icon}</Graphic>
						<Text class="{isActive(tab) ? "" : "nav-item"}">{tab.label}</Text>
					</Item>
				{/if}
			{/each}
			{#each tabs as tab}
				{#if tab.nest}
					<Separator />
					<Subheader>{tab.label}</Subheader>
					{#each tab.children as subTab}
						{#if subTab.label == 'Managers'}
							{#if managers.length}
								<Item href={subTab.dest} on:click={(event) => selectTab(event, subTab)} activated={isActive(subTab)}  on:touchstart={() => preloadData(subTab.dest)} on:mouseover={() => preloadData(subTab.dest)}>
									<Graphic class="material-icons{isActive(subTab) ? "" : " nav-item"}" aria-hidden="true">{subTab.icon}</Graphic>
									<Text class="{isActive(subTab) ? "" : "nav-item"}">{subTab.label}</Text>
								</Item>
							{/if}
						{:else}
							<Item href={subTab.dest} on:click={(event) => selectTab(event, subTab)} activated={isActive(subTab)}  on:touchstart={() => {if(subTab.label != 'Go to Sleeper') preloadData(subTab.dest)}} on:mouseover={() => {if(subTab.label != 'Go to Sleeper') preloadData(subTab.dest)}}>
								<Graphic class="material-icons{isActive(subTab) ? "" : " nav-item"}" aria-hidden="true">{subTab.icon}</Graphic>
								<Text class="{isActive(subTab) ? "" : "nav-item"}">{subTab.label}</Text>
							</Item>
						{/if}
					{/each}
				{/if}
			{/each}
		</List>
	</Content>
  </Drawer>
	

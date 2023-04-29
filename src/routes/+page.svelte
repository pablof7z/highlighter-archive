<script lang="ts">
	import 'websocket-polyfill';
	import MyHighlightsIcon from '$lib/icons/MyHighlights.svelte';
    import GlobalIcon from '$lib/icons/Global.svelte';
    import FollowsIcon from '$lib/icons/Follows.svelte';
    import AboutIcon from '$lib/icons/About.svelte';
    import HowIcon from '$lib/icons/How.svelte';
    import ConsoleIcon from '$lib/icons/Console.svelte';

	import { Tooltip } from 'flowbite-svelte';

	import { currentUser } from '$lib/store';
	import { onMount } from 'svelte';
	import HighlightList from '$lib/components/HighlightList.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import Console from '$lib/components/Console.svelte';
	import RadioButton from '$lib/components/buttons/radio.svelte';
	import About from '$lib/components/About.svelte';
	import How from '$lib/components/How.svelte';

	onMount(async () => {
		const urlMode = window.location.hash.replace('#', '');
		if (urlMode && ['global', 'console', 'what', 'how'].includes(urlMode)) {
			mode = urlMode;
		}

		setMode();
    });

	let followPubkeys: string[];
	let mode = 'global';

	async function loadContacts() {
		if (!followPubkeys) {
			const followList = await $currentUser?.follows();
			followPubkeys = Array.from(followList).map((u) => u.hexpubkey());
		}
	}

	async function setMode() {
		window.location.hash = mode === 'what' ? '' : mode;
	}
</script>

<svelte:head>
	<title>HIGHLIGHTER.com</title>
	<meta name="description" content="Unleash valuable words from their artificial silos" />
</svelte:head>

<Hero />

<main class="max-w-2xl mx-auto pb-32">
	<div class="
		flex flex-row text-slate-300 items-center justify-center mb-4 sm:mb-12 sm:gap-4
		whitespace-nowrap
	">
		<RadioButton bind:group={mode} on:change={setMode} value="my">
			<MyHighlightsIcon />
			<span class="hidden sm:block">Personal</span>
		</RadioButton>
		<Tooltip>Your personal highlights</Tooltip>

		<RadioButton bind:group={mode} on:change={setMode} value="network">
			<FollowsIcon />
			<span class="hidden sm:block">Tribe</span>
		</RadioButton>
		<Tooltip>Highlights from the people you follow [coming soon!]</Tooltip>

		<RadioButton bind:group={mode} on:change={setMode} value="global">
			<GlobalIcon />
			<span class="hidden sm:block">Global</span>
		</RadioButton>
		<Tooltip>Global Feed</Tooltip>

		<RadioButton bind:group={mode} on:change={setMode} value="console">
			<ConsoleIcon />
			<span class="hidden sm:block">Console</span>
		</RadioButton>
		<Tooltip>Console</Tooltip>

		<RadioButton bind:group={mode} on:change={setMode} value="what">
			<AboutIcon />
			<span class="hidden sm:block">What is this?</span>
		</RadioButton>

		<RadioButton bind:group={mode} on:change={setMode} value="how">
			<HowIcon />
			<span class="hidden sm:block">How</span>
		</RadioButton>
	</div>

	{#if mode === 'what'}
		<About />
	{:else if mode === 'how'}
		<How />
	{:else if mode === 'console'}
		<Console />
	{:else if mode === 'my'}
		{#if $currentUser?.hexpubkey()}
			<HighlightList filter={{ pubkeys: [$currentUser?.hexpubkey()] }} />
		{/if}
	{:else if mode === 'network'}
		{#await loadContacts()}
			<div class="text-white">loading</div>
		{:then}
			{#if followPubkeys}
				<HighlightList filter={{ pubkeys: followPubkeys }} />
			{/if}
		{/await}
	{:else if mode === 'global'}
		<HighlightList filter={{ limit: 50 }} />
	{/if}
</main>

<Footer />
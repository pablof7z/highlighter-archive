<script lang="ts">
	import 'websocket-polyfill';
	import HighlightsNavigationMenu from './HighlightsNavigationMenu.svelte';

	import { currentUser, backgroundBanner } from '$lib/store';
	import { onMount } from 'svelte';
	import HighlightList from '$lib/components/HighlightList.svelte';

    $backgroundBanner = null;

	let followPubkeys: string[];

	let loadContactsPromise: Promise<void>;

	onMount(() => {
		loadContactsPromise = loadContacts();
	})

	async function loadContacts() {
		if (!followPubkeys) {
			const followList = await $currentUser?.follows();
			followPubkeys = Array.from(followList).map((u) => u.hexpubkey());
		}
	}
</script>

<svelte:head>
	<title>HIGHLIGHTER.com</title>
	<meta name="description" content="Unleash valuable words from their artificial silos" />
</svelte:head>

<main class="max-w-2xl mx-auto pb-32">
	<HighlightsNavigationMenu />

	{#if loadContactsPromise}
		{#await loadContactsPromise}
			<div class="text-white">loading</div>
		{:then}
			{#if followPubkeys}
				<HighlightList filter={{ pubkeys: followPubkeys }} />
			{/if}
		{/await}
	{/if}

	<!-- {#if mode === 'what'}
	{:else if mode === 'how'}
		<How />
	{:else if mode === 'console'}
		<Console />
	{:else if mode === 'my'}
		{#if $currentUser?.hexpubkey()}
			<HighlightList filter={{ pubkeys: [$currentUser?.hexpubkey()] }} />
		{/if}
	{:else if mode === 'network'}

	{:else if mode === 'global'}
		<HighlightList filter={{ limit: 50 }} />
	{/if} -->
</main>
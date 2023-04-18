<script lang="ts">
	import 'websocket-polyfill';
	import MyHighlightsIcon from '$lib/icons/MyHighlights.svelte';
    import GlobalIcon from '$lib/icons/Global.svelte';
    import FollowsIcon from '$lib/icons/Follows.svelte';
    import AboutIcon from '$lib/icons/About.svelte';
    import HowIcon from '$lib/icons/How.svelte';

	import { Tooltip } from 'flowbite-svelte';

	import HighlightInterface from '$lib/interfaces/highlights';

	import { ndk } from '$lib/store';
	import { onMount, onDestroy } from 'svelte';
	import HighlightList from '$lib/components/HighlightList.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import RadioButton from '$lib/components/buttons/radio.svelte';
	import About from '$lib/components/About.svelte';
	import How from '$lib/components/How.svelte';
	import type { NDKSubscription } from '@nostr-dev-kit/ndk';

	let highlights;
    let _highlights: App.Highlight[] = [];
	let activeSubs: NDKSubscription | undefined;

	onMount(async () => {
		const urlMode = window.location.hash.replace('#', '');
		if (urlMode && ['my', 'global', 'network', 'about', 'how'].includes(urlMode)) {
			mode = urlMode;
		}

		setMode();
    });

	onDestroy(() => {
		if (activeSubs) {
			activeSubs.stop();
			activeSubs = undefined;
		}
	});

	let allPubkeys = [];
	let renderedAt: string;

	$: {
		if ($highlights) {
			console.log($highlights);

			allPubkeys = Array.from(new Set(($highlights||[]).map((h: App.Highlight) => h.pubkey)));
		}

		_highlights = (($highlights || []) as App.Highlight[]).sort((a, b) => {
			return b.timestamp - a.timestamp;
		});

		_highlights = _highlights;
		renderedAt = (new Date()).toLocaleString();
	}

	let currentUser: string;

	async function myHighlights(): Promise<NDKSubscription | undefined> {
		const user = await $ndk.signer?.user();
		if (!user) return;

		currentUser = user.npub;

		const opts = { pubkeys: [user.hexpubkey()] };
		highlights = HighlightInterface.load(opts);
		return HighlightInterface.startStream(opts);
	}

	function globalHighlights() {
		highlights = HighlightInterface.load();
		return HighlightInterface.startStream();
	}

	// check if there is anchor on the URL, if there is, use that as the mode
	// otherwise, use 'global'
	let mode = 'global';

	async function setMode() {
		highlights = null;
		_highlights = [];

		if (activeSubs) {
			activeSubs.stop();
			activeSubs = undefined;
		}

		switch (mode) {
			case 'my':
				activeSubs = await myHighlights();
				break;
			case 'global':
				activeSubs = globalHighlights();
				break;
			case 'network':
				break;
		}

		window.location.hash = mode === 'global' ? '' : mode;
	}
</script>

<Hero />

<main class="max-w-2xl mx-auto pb-32">
	<div class="
		flex flex-row text-slate-300 items-center justify-center mb-4 sm:mb-16 gap-4
	">
		<RadioButton bind:group={mode} on:change={setMode} value="my">
			<MyHighlightsIcon />
			<span class="hidden sm:block">My Highlights</span>
		</RadioButton>
		<Tooltip>Your personal highlights</Tooltip>

		<RadioButton bind:group={mode} on:change={setMode} value="network">
			<FollowsIcon />
			<span class="hidden sm:block">Tribe</span>
		</RadioButton>
		<Tooltip>Highlights from the people you follow [coming soon!]</Tooltip>

		<RadioButton bind:group={mode} on:change={setMode} value="global">
			<GlobalIcon />
			<span class="hidden sm:block">Atlas</span>
		</RadioButton>
		<Tooltip>Global Feed</Tooltip>

		<RadioButton bind:group={mode} on:change={setMode} value="about">
			<AboutIcon />
			About
		</RadioButton>

		<RadioButton bind:group={mode} on:change={setMode} value="how">
			<HowIcon />
			How
		</RadioButton>
	</div>

	{#if mode === 'about'}
		<About />
	{:else if mode === 'how'}
		<How />
	{:else if mode === 'my' || mode === 'global'}
		<div class="grid grid-cols-1 gap-8">
			{#each _highlights as highlight}
				<HighlightList {highlight} />
			{/each}
		</div>
	{:else if mode === 'network'}
		<div class="text-center text-slate-300 flex flex-col items-center">
			<div class="text-2xl my-4">
				Coming soon™️
			</div>
		</div>
	{/if}
</main>

<Footer />
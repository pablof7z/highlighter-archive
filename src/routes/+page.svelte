<script lang="ts">
	import 'websocket-polyfill';
	import MyHighlightsIcon from '$lib/icons/MyHighlights.svelte';
    import GlobalIcon from '$lib/icons/Global.svelte';
    import FollowsIcon from '$lib/icons/Follows.svelte';
    import AboutIcon from '$lib/icons/About.svelte';
    import HowIcon from '$lib/icons/How.svelte';
    import ConsoleIcon from '$lib/icons/Console.svelte';

	import { Tooltip } from 'flowbite-svelte';

	import HighlightInterface from '$lib/interfaces/highlights';

	import { ndk } from '$lib/store';
	import { onMount, onDestroy } from 'svelte';
	import HighlightList from '$lib/components/HighlightList.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import Console from '$lib/components/Console.svelte';
	import RadioButton from '$lib/components/buttons/radio.svelte';
	import About from '$lib/components/About.svelte';
	import How from '$lib/components/How.svelte';
	import type { NDKSubscription, NDKUser } from '@nostr-dev-kit/ndk';

	let highlights;
    let _highlights: App.Highlight[] = [];
	let activeSubs: Promise<NDKSubscription[] | undefined> | undefined;

	onMount(async () => {
		const urlMode = window.location.hash.replace('#', '');
		if (urlMode && ['global', 'console', 'what', 'how'].includes(urlMode)) {
			mode = urlMode;
		}

		setMode();
    });

	onDestroy(async () => {
		await stopActiveSub();
	});

	async function stopActiveSub() {
		const _activeSubs = await activeSubs;
		if (_activeSubs) {
			for (const a of _activeSubs) a.stop();
			activeSubs = undefined;
		}
	}

	$: {
		_highlights = (($highlights || []) as App.Highlight[]).sort((a, b) => {
			return b.timestamp - a.timestamp;
		});

		_highlights = _highlights;
	}

	let currentNpub: string;
	let followList: Set<NDKUser> | undefined;

	async function myHighlights(): Promise<NDKSubscription[] | undefined> {
		const user = await $ndk.signer?.user();
		if (!user) {
			alert("you don't seem to have a NIP-07 nostr extension")
			mode = 'global';
			return;
		}

		currentNpub = user.npub;

		const opts = { pubkeys: [user.hexpubkey()] };
		highlights = HighlightInterface.load(opts);
		return HighlightInterface.startStream(opts);
	}

	async function networkHighlights(): Promise<NDKSubscription[] | undefined> {
		const user = await $ndk.signer?.user();
		if (!user) {
			alert("you don't seem to have a NIP-07 nostr extension")
			mode = 'global';
			return;
		}
		user.ndk = $ndk;

		currentNpub = user.npub;

		if (!followList) {
			followList = await user.follows();
		}

		const followPubkeys = Array.from(followList).map((u) => u.hexpubkey());

		const opts = { pubkeys: followPubkeys };
		highlights = HighlightInterface.load(opts);
		return HighlightInterface.startStream(opts);
	}

	async function globalHighlights() {
		highlights = HighlightInterface.load();
		return HighlightInterface.startStream();
	}

	let mode = 'global';

	async function setMode() {
		_highlights = [];

		await stopActiveSub();

		setTimeout(() => {
			switch (mode) {
				case 'my':
					activeSubs = myHighlights();
					break;
				case 'network':
					activeSubs = networkHighlights();
					break;
				case 'global':
					activeSubs = globalHighlights();
					break;
			}
		}, 2000);

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
	{:else if mode === 'my' || mode === 'global' || mode === 'network'}
		<div class="grid grid-cols-1 gap-8">
			{#each _highlights as highlight}
				<HighlightList {highlight} disableClick={true} />
			{/each}
		</div>
	{/if}
</main>

<Footer />
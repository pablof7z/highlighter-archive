<script lang="ts">
	import 'websocket-polyfill';
	import MyHighlightsIcon from '$lib/icons/MyHighlights.svelte';
    import GlobalIcon from '$lib/icons/Global.svelte';
    import FollowsIcon from '$lib/icons/Follows.svelte';

	import { Tooltip } from 'flowbite-svelte';


	import HighlightInterface from '$lib/interfaces/highlights';

	import { ndk } from '$lib/store';
	import { onMount } from 'svelte';
	import HighlightList from '$lib/components/HighlightList.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import UserInterface from '$lib/interfaces/users';
	import RadioButton from '$lib/components/buttons/radio.svelte';
	import About from '$lib/components/About.svelte';

	let highlights;
    let _highlights: App.Highlight[] = [];

	onMount(async () => {
		const urlMode = window.location.hash.replace('#', '');
		if (urlMode && ['my', 'global', 'network', 'about'].includes(urlMode)) {
			mode = urlMode;
		}

        setTimeout(() => {
            highlights = HighlightInterface.load();
        }, 100);
    });

	$: {
		_highlights = ($highlights || []) as App.Highlight[];

		if (_highlights) {
			// request responses and profiles
			UserInterface
		}
	}

	async function myHighlights() {
		const user = await $ndk.signer?.user();
		if (!user) return;

		highlights = HighlightInterface.load({
			pubkeys: [user.hexpubkey()]
		});
	}

	async function globalHighlights() {
		highlights = HighlightInterface.load();
	}

	// check if there is anchor on the URL, if there is, use that as the mode
	// otherwise, use 'global'
	let mode = 'global';

	function setMode(newMode: string, prevMode: string) {
		switch (mode) {
			case 'my':
				myHighlights();
				break;
			case 'global':
				globalHighlights();
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

		<RadioButton bind:group={mode} on:change={setMode} value="about">About</RadioButton>
	</div>

	{#if mode === 'about'}
		<About />
	{:else if mode === 'my' || mode === 'global'}
		{#if $highlights}
			<div class="grid grid-cols-1 gap-8">
				{#each $highlights as highlight}
					<HighlightList {highlight} />
				{/each}
			</div>
		{/if}
	{:else if mode === 'network'}
		<div class="text-center text-slate-300 flex flex-col items-center">
			<div class="text-2xl my-4">
				Coming soon™️
			</div>
		</div>
	{/if}
</main>

<footer class="py-6 font-mono text-white text-center mt-12 px-10 fixed bottom-0 w-full bg-gray-1000 border-t border-t-gray-800">
	<div class="flex justify-center flex-row">
		<div class="text-sm">
			ZAPWORDTHY
			by
			<a class="text-purple-50 hover:text-orange-400" href="https://pablof7z.com">
				@pablof7z
			</a>
		</div>
	</div>
</footer>

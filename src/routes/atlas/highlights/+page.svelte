<script lang="ts">
    import { ndk, currentUser } from '$lib/store';

    import HighlightInterface from '$lib/interfaces/highlights';
    import HighlightList from '../components/highlights/Card.svelte';
    import { onMount } from 'svelte';

    let highlights, _highlights: App.Highlight[] = [];

    async function loadHighlights() {
        const user = await $ndk.signer?.user();

		if (!user) {
            setTimeout(() => {
                loadHighlights();
            }, 100);
            return;
		}

		const opts = { pubkeys: [user.hexpubkey()] };
		highlights = HighlightInterface.load(opts);
		return HighlightInterface.startStream(opts);
    }

    onMount(async () => {
        loadHighlights();
    })

    $: {
		_highlights = (($highlights || []) as App.Highlight[]).sort((a, b) => {
			return b.timestamp - a.timestamp;
		});

		_highlights = _highlights;
	}
</script>

<div class="grid grid-flow-row md:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
    {#each _highlights as highlight}
        <HighlightList {highlight} disableClick={true} />
    {/each}
</div>
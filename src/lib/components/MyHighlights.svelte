<script lang="ts">
	import Highlight from './../icons/Highlight.svelte';
    import { onDestroy, onMount } from "svelte";

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

    onMount(() => {
        console.log('mount');
    })

    onDestroy(() => {
        console.log('destroy');
    })
</script>

<div class="grid grid-cols-1 gap-8">
    my Highlight
    <!-- {#each _highlights as highlight}
        <HighlightList {highlight} disableClick={true} />
    {/each} -->
</div>
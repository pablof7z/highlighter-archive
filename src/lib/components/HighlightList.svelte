<script lang="ts">
    import HighlightInterface from "$lib/interfaces/highlights";
    import type {ILoadOpts} from "$lib/interfaces/highlights";
    import type { Observable } from "dexie";

    import HighlightListItem from "./HighlightListItem.svelte";

    import { onDestroy, onMount } from "svelte";
    import type { NDKSubscription } from "@nostr-dev-kit/ndk";

    export let filter: ILoadOpts;
    let subs: NDKSubscription[] = [];
    let items: Observable<App.Highlight[]>;

    onMount(() => {
		items = HighlightInterface.load(filter);
		subs = HighlightInterface.startStream(filter);
	});

    onDestroy(() => {
        subs.forEach((sub) => sub.stop());
    });
</script>

<div class="grid grid-cols-1 gap-8">
    {#if $items}
        {#each $items as item}
            <HighlightListItem highlight={item} disableClick={true} />
        {/each}
    {/if}
</div>
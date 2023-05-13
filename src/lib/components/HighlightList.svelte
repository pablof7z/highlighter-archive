<script lang="ts">
    import HighlightInterface from "$lib/interfaces/highlights";
    import type {ILoadOpts} from "$lib/interfaces/highlights";
    import type { Observable } from "dexie";

    import HighlightListItem from "./HighlightListItem.svelte";

    import { onDestroy, onMount } from "svelte";
    import type { NDKSubscription } from "@nostr-dev-kit/ndk";

    export let article: App.Article | undefined = undefined;
    export let items: Observable<App.Highlight[]> | undefined = undefined;
    export let filter: ILoadOpts | undefined = undefined;

    export let skipTitle: boolean = false;
    let subs: NDKSubscription[] = [];

    onMount(() => {
        if (filter) {
            items = HighlightInterface.load(filter);
            subs = HighlightInterface.startStream(filter);
        }
	});

    onDestroy(() => {
        subs.forEach((sub) => sub.stop());
    });
</script>

<div class="grid grid-cols-1 gap-8 pb-32">
    {#if $items}
        {#each $items as item}
            <HighlightListItem
                highlight={item}
                {skipTitle}
                disableClick={true}
                {article}
                />
        {/each}
    {/if}
</div>
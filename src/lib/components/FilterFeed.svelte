<script lang="ts">
    import ndk from '$lib/stores/ndk';
	import GenericEventCard from '$lib/components/events/generic/card.svelte';
    import type { ILoadOpts } from '$lib/interfaces/notes';
    import NoteInterface from '$lib/interfaces/notes';
    import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
    import type { Observable } from 'dexie';

    export let filter: NDKFilter;

    let feed: NDKEvent[] = [];

    const sub = $ndk.subscribe(filter, { closeOnEose: false});

    sub.on('event', (e, r) => {
        console.log(`${r.url}: ${e.id}`);
        feed.push(e);
        feed = feed;
    })
</script>

{#each feed as event}
    <GenericEventCard
        event={event}
        skipReplies={true}
    />
{/each}
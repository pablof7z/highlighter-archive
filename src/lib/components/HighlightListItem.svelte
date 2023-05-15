<script lang="ts">
    import HighlightCard from '$lib/components/highlights/card.svelte';

    import NoteInterface from '$lib/interfaces/notes';

    import Avatar from '$lib/components/Avatar.svelte';

    import ndk from '$lib/stores/ndk';
    import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
    import {nip19} from 'nostr-tools';
    import NoteCard from '$lib/components/notes/card.svelte';
    import type { ILoadOpts } from '$lib/interfaces/highlights';

    export let article: App.Article | undefined = undefined;
    export let highlight: App.Highlight;
    export let skipUrl: boolean = false;
    export let skipTitle: boolean = false;
    export let skipButtons: boolean = false;
    export let disableClick: boolean = false;
    export let collapsedQuotes: boolean = true;
    let prevHighlightId: string | undefined = undefined;

    let replies, quotes;
    let pubkey: string;
    let showComments = false;
    let showReplies = false;
    let event: NDKEvent;
    let articleLink: string;
    let naddr: string;
    let highlightNoteId = '';
    let niceTime: string;
    let quotePubkeys: string[] = [];

    // Set the quote pubkeys
    $: if ($quotes && $quotes.length > 0 && quotes.length != quotePubkeys.length) {
        quotePubkeys = $quotes.map(q => q.pubkey);
    }

    $: {
        if (prevHighlightId !== highlight.id && highlight.id) {
            showComments = false;
            showReplies = false;
            prevHighlightId = highlight.id;
            niceTime = new Date(highlight.timestamp * 1000).toLocaleString();

            highlightNoteId = nip19.noteEncode(highlight.id);

            if (highlight.articleId) {
                if (highlight.articleId.match(/:/)) {
                    const [kind, pubkey, identifier] = highlight.articleId.split(':');
                    naddr = nip19.naddrEncode({
                        kind: parseInt(kind),
                        pubkey,
                        identifier
                    })
                } else {
                    naddr = nip19.noteEncode(highlight.articleId);
                }
                articleLink = `/a/${naddr}`;
            } else {
                // see if this highlight.event has a p tag
                try {
                    const event = new NDKEvent(undefined, JSON.parse(highlight.event));
                    const pTag = event.getMatchingTags('p')[0];

                    articleLink = `/load?url=${encodeURIComponent(highlight.url)}`

                    if (pTag && pTag[1]) {
                        articleLink += `&author=${encodeURIComponent(pTag[1])}`;
                    }
                } catch (e) {
                }
            }

            const pubkeyFilter: ILoadOpts = {}; // XXX filter by selected pubkeys

            // if ($currentScope.pubkeys) {
            //     pubkeyFilter.pubkeys = $currentScope.pubkeys;
            // }

            replies = NoteInterface.load({ replies: [highlight.id], ...pubkeyFilter });
            quotes = NoteInterface.load({ quotes: [highlight.id], ...pubkeyFilter });
        }

        if (!event || event.id !== highlight.id) {
            try {
                event = new NDKEvent($ndk, JSON.parse(highlight.event));
            } catch (e) {
                console.error(e);
            }
        }

        pubkey = highlight.pubkey;
    }

    function shouldDisplayQuote(highlight: App.Highlight, quotes: App.Note[]) {
        return true;
        // if (!quotes || quotes.length === 0) {
        //     return true;
        // }


    }
</script>

<div class="
    flex flex-col
    {collapsedQuotes? '' : 'gap-8'}
">
    {#if shouldDisplayQuote(highlight, $quotes)}
        <div class="text-lg">
            <HighlightCard
                {event}
                {highlight}
                {skipButtons}
                {skipTitle}
                {disableClick}
            />
        </div>
    <!-- {:else if shouldDisplayHighlighterQuote(highlight, $quotes)} -->
    {/if}

    {#if ($quotes||[]).length > 0}
        {#if collapsedQuotes}
            <div class="px-8 py-3">
                <div class="flex flex-row gap-2 items-center">
                    <div class="isolate flex -space-x-2 overflow-hidden">
                        {#each Array.from(new Set(quotePubkeys)).slice(0, 6) as quotePubkey}
                            <div class="relative z-30 inline-block h-8 w-8 rounded-full ring-2 ring-white">
                                <Avatar pubkey={quotePubkey} />
                            </div>
                        {/each}
                    </div>

                    <button
                        class="text-xs font-medium text-zinc-600 hover:text-zinc-500"
                        on:click={() => { collapsedQuotes = false }}>
                        Show {$quotes.length} notes...
                    </button>
                </div>
            </div>
        {:else}
            <div class="ml-6 flex flex-col gap-6 quote-card">
                {#each ($quotes||[]) as quote}
                    <div class="text-lg">
                        <NoteCard note={quote} {highlight} />
                    </div>
                {/each}
            </div>
        {/if}
    {/if}
</div>

<style>
    /* .quote-card {
        @apply text-lg;
    }

    :global(.embedded-card) {
        @apply text-base;
    } */
</style>
<script lang="ts">
    import EventCard from '$lib/components/events/card.svelte';
    import HighlightContent from '$lib/components/highlights/content.svelte';

    import ndk from '$lib/stores/ndk';
    import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
    import {nip19} from 'nostr-tools';
    import type { ILoadOpts } from '$lib/interfaces/highlights';

    export let article: App.Article | undefined = undefined;
    export let highlight: App.Highlight;
    export let skipUrl: boolean = false;
    export let skipTitle: boolean = false;
    export let skipButtons: boolean = false;
    export let skipFooter: boolean = false;
    export let disableClick: boolean = false;
    let prevHighlightId: string | undefined = undefined;

    let domain: string | undefined;
    let pubkey: string;
    let event: NDKEvent;
    let articleLink: string;
    let naddr: string;
    let highlightNoteId = '';

    function onContentClick(e) {
        if (disableClick) return;

        // see if there is an element that has attribute data-highlight with the id of the highlight
        // if there is, then we want to scroll to that element
        const el = document.querySelector(`[data-highlight-id="${highlight.id}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
            el.classList.add('bg-slate-100');
            setTimeout(() => {
                el.classList.remove('bg-slate-100');
            }, 1000);

            e.preventDefault();
        } else {
            if (window && window.find && window.find(highlight.content)) {
                e.preventDefault();
            }
        }
    }

    $: {
        if (prevHighlightId !== highlight.id && highlight.id) {
            prevHighlightId = highlight.id;

            highlightNoteId = nip19.noteEncode(highlight.id);

            if (highlight.articleId) {
                const [kind, pubkey, identifier] = highlight.articleId.split(':');
                naddr = nip19.naddrEncode({
                    kind: parseInt(kind),
                    pubkey,
                    identifier
                })
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
        }

        if (!event || event.id !== highlight.id) {
            try {
                event = new NDKEvent($ndk, JSON.parse(highlight.event));
            } catch (e) {
                console.error(e);
            }
        }

        pubkey = highlight.pubkey;

        domain = highlight.url && new URL(highlight.url).hostname;
    }

</script>

<EventCard
    {event}
    {highlight}
    {skipButtons}
    byString={"highlighted by"}
    skipHeader={skipTitle}
    {skipFooter}
>
    <a href={articleLink} on:click={onContentClick} class="
    leading-relaxed h-full flex flex-col
    py-2
    overflow-auto
    ">
        <div class="border-l-4 border-orange-300 pl-4 py-4">
            <HighlightContent {highlight} />
        </div>
    </a>
</EventCard>

<style>
    /* :global(.event-card) {
        @apply text-lg;
    } */
</style>
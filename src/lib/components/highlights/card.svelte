<script lang="ts">
    import EventCard from '$lib/components/events/card.svelte';
    import HighlightContent from '$lib/components/highlights/content.svelte';

    import ndk from '$lib/stores/ndk';
    import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
    import {nip19} from 'nostr-tools';
    import type { ILoadOpts } from '$lib/interfaces/highlights';
    import ArticleInterface from '$lib/interfaces/article';
    import type { Observable } from 'dexie';

    export let article: App.Article | undefined = undefined;
    export let highlight: App.Highlight;
    export let skipTitle: boolean = false;
    export let skipButtons: boolean = false;
    export let skipFooter: boolean = false;
    export let disableClick: boolean = false;
    let prevHighlightId: string | undefined = undefined;

    let event: NDKEvent;
    let articleLink: string;
    let naddr: string;

    function onContentClick(e: Event) {
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

    let articles: Observable<App.Article[]> | undefined = undefined;

    $: if (highlight?.articleId && !articles) {
        articles = ArticleInterface.load({id: highlight.articleId});
    }

    $: if (articles && $articles && $articles.length > 0) {
        article = $articles[0];
    }

    $: {
        if (prevHighlightId !== highlight.id && highlight.id) {
            prevHighlightId = highlight.id;

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
        }

        if (!event || event.id !== highlight.id) {
            try {
                event = new NDKEvent($ndk, JSON.parse(highlight.event));
            } catch (e) {
                console.error(e);
            }
        }
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
    <div slot="header">
        <div class="text-xl font-semibold truncate">
            {article?.title||highlight.url||highlight.id||'untitled'}
        </div>
    </div>

    <a href={articleLink} on:click={onContentClick} class="
        leading-relaxed h-full flex flex-col
        py-2
        overflow-auto
    ">
        <HighlightContent {highlight} />
    </a>
</EventCard>

<style>
    /* :global(.event-card) {
        @apply text-lg;
    } */
</style>
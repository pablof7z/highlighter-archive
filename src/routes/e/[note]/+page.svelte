<script lang="ts">
    import { page } from '$app/stores';
    import HighlightInterface from '$lib/interfaces/highlights';
    import { nip19 } from 'nostr-tools';
    import Widget from '../../../Widget.svelte';
    import TurndownService from "turndown";
    import { onMount } from 'svelte';
    import { fetchArticle } from '$lib/article';
    import Highlight from '$lib/components/Highlight.svelte';

    let { note } = $page.params;
    let hexid = nip19.decode(note).data;

    let highlights = HighlightInterface.fromIds([hexid as string]);
    let _highlights: App.Highlight[] = [];
    let articleFetched = false;
    let article: any;

    $: {
        _highlights = ($highlights || []) as App.Highlight[];

        if (_highlights[0] && !articleFetched) {
            articleFetched = true;
            let url = _highlights[0].url;

            url = 'https://dergigi.com/2023/04/04/purple-text-orange-highlights/';

            fetchArticle(url).then((a) => {
                article = a;
            });
        }
    }

    onMount(async () => {
        article = await fetchArticle(_highlights[0]?.url);
    })
</script>

<div class="flex flex row w-screen gap-12">
    <div class="w-3/5 text-lg p-8 bg-white shadow-2xl text-justify font-serif text-slate-700 leading-loose">
        {@html article?.content}
    </div>
    <div class="w-2/5 p-8">
        {#if _highlights}
            <div class="flex flex-col gap-6">
                {#each _highlights as highlight}
                    <Highlight {highlight} />
                {/each}
            </div>
        {/if}
    </div>
</div>

<Widget />
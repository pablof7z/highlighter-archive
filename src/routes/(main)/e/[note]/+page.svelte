<script lang="ts">
    import { page } from '$app/stores';
    import HighlightInterface from '$lib/interfaces/highlights';
    import { nip19 } from 'nostr-tools';
    import { onMount } from 'svelte';
    import { fetchArticle } from '$lib/article';
    import Highlight from '$lib/components/HighlightListItem.svelte';

    let { note } = $page.params;
    let hexid = nip19.decode(note).data;

    let highlights;
    let _highlights: App.Highlight[] = [];
    let articleFetched = false;
    let article: any;

    $: {
        _highlights = ($highlights || []) as App.Highlight[];

        if (_highlights[0] && !articleFetched) {
            articleFetched = true;
            let url = _highlights[0].url;

            fetchArticle(url).then((a) => {
                article = a;
            });
        }
    }

    onMount(async () => {
        highlights = HighlightInterface.fromIds([hexid as string]);
        HighlightInterface.startStream({ids: [hexid as string]});
    })
</script>

<svelte:head>
	<title>HIGHLIGHTER.com</title>
	<meta name="description" content="Unleash valuable words from their artificial silos" />
</svelte:head>

<main class="max-w-xl mx-auto pb-32">
    {#each _highlights as highlight}
        <Highlight {highlight} disableClick={true} />
    {/each}
</main>
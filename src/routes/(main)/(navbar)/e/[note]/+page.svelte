<script lang="ts">
    import { page } from '$app/stores';
    import HighlightInterface, { handleEvent9802 } from '$lib/interfaces/highlights';
    import { nip19 } from 'nostr-tools';
    import { onMount } from 'svelte';
    import { fetchArticle } from '$lib/article';
    import Highlight from '$lib/components/HighlightListItem.svelte';
    import Note from '$lib/components/Note.svelte';
    import ndk from '$lib/stores/ndk';
    import { handleEvent1 } from '$lib/interfaces/notes';

    let { note } = $page.params;
    let hexid = nip19.decode(note).data;

    let highlights;
    let _highlights: App.Highlight[] = [];
    let _note: App.Note;
    let articleFetched = false;
    let article: any;

    $: {
        $ndk.fetchEvent({ids: [hexid as string]}).then((e) =>{
            console.log(`requested event ${hexid}`, e);
            if (!e) return;

            if (e.kind === 9802) {
                handleEvent9802(e).then((h) => {
                    _highlights = [h];
                });
            }

            if (e.kind === 1) {
                _note = handleEvent1(e);
            }
        })
    }

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

    {#if _note}
        <Note note={_note} />
    {/if}
</main>
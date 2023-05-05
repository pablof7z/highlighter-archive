<script lang="ts">
	import Highlight from '$lib/components/HighlightListItem.svelte';
    import { page } from '$app/stores';
    import ArticleInterface from '$lib/interfaces/article';
    import HighlightInterface from '$lib/interfaces/highlights';
    import NoteInterface from '$lib/interfaces/notes';
    import { onMount } from 'svelte';
    import Widget from '../../../../Widget.svelte';
    import MarkdownIt from 'markdown-it';
    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import Article from '$lib/components/Article.svelte';
    import type { NDKSubscription } from '@nostr-dev-kit/ndk';
    import { openModal } from 'svelte-modals'
    import HighlightIntroModal from '$lib/modals/HighlightIntro.svelte';

    const { naddr } = $page.params;

    let articles;
    let _articles: App.Article[] = [];
    let article: App.Article;
    let content: string = '';

    let highlights;
    let _highlights: App.Highlight[] = [];

    let notes;
    let _notes: App.Note[] = [];
    let activeSub: NDKSubscription[] | undefined;
    let replacedHighlights: Record<string, boolean> = {};

    onMount(async () => {
        articles = ArticleInterface.load({naddr});
        highlights = HighlightInterface.load({articleNaddr: naddr});
        activeSub = HighlightInterface.startStream({articleNaddr: naddr});
        notes = NoteInterface.load({articleNaddr: naddr});

        // check if the highlightintro modal has been displayed on localStorage
        if (!localStorage.getItem('highlightIntro')) {
            openModal(HighlightIntroModal);
            localStorage.setItem('highlightIntro', 'true');
        }
    });

    $: {
        _articles = ($articles || []) as App.Article[];
        if (!article) article = _articles[0];

        if (article) {
            _highlights = ($highlights || []) as App.Highlight[];
            _notes = ($notes || []) as App.Note[];
        }

        if (article && !content) {
            const md = new MarkdownIt();
            md.linkify?.set();
            content = md.render(article.content);
        }

        if (_highlights && content) {
            for (const highlight of _highlights) {
                if (replacedHighlights[highlight.id!]) continue;

                content = content.replace(highlight.content, `<mark data-highlight-id="${highlight.id}">${highlight.content}</mark>`);
                replacedHighlights[highlight.id!] = true;
            }
        }
    }
</script>

<div class="flex flex-row sm:flex-row w-full mx-auto px-6 h-screen">
    <div class="
        text-lg p-8 bg-black shadow-lg text-justify text-slate-700 leading-loose flex flex-col gap-2
        rounded-xl w-7/12
        overflow-auto
    ">
        {#if article}
            <!-- Title -->
            <h1 class="text-3xl sm:text-5xl text-white font-black font-sans leading-normal text-left">{article.title}</h1>

            <div class="flex flex-row justify-between">
                <!-- Author / URL -->
                {#if article?.author}
                    <h2 class="flex flex-row items-center text-sm sm:text-sm gap-4">
                        <div class="flex flex-row gap-4 items-start">
                            <Avatar pubkey={article.author} klass="h-8" />
                            <div class=" text-gray-500 text-lg">
                                <Name pubkey={article.author} />
                            </div>
                        </div>
                    </h2>
                {:else if article?.url}
                    <div class="text-slate-600 text-xs whitespace-nowrap">
                        {article.url}
                    </div>
                {:else}
                    <div></div>
                {/if}

                <!-- Publisher -->
                {#if article?.publisher != article?.author}
                    <h2 class="flex flex-row items-center text-sm sm:text-sm gap-4">
                        Published by
                        <div class="flex flex-row items-center gap-2">
                            <Avatar pubkey={article.publisher} klass="h-10" />
                            <Name pubkey={article.publisher} />
                        </div>
                    </h2>
                {/if}
            </div>


            <!-- Highlight count on mobile -->
            {#if $highlights && $highlights.length > 0}
                <a href="#highlights" class="
                    sm:hidden
                    font-sans text-base
                    text-purple-500
                ">{$highlights?.length} highlights</a>
            {/if}

            <!-- Content -->
            <article class="my-6 font-serif">
                <Article>
                    {@html content}
                </Article>
            </article>
        {/if}
    </div>

    <!-- Sidebar -->
    <div class="px-4 overflow-auto w-5/12">
        {#if _highlights}
            <div class="flex flex-col gap-6">
                {#each _highlights as highlight}
                    <Highlight {highlight} skipUrl={true} skipTitle={true} />
                {/each}
            </div>
        {/if}
    </div>
</div>

<!-- <Widget loadHighlights={false} position="bottom-5 left-5 flex-col-reverse" /> -->

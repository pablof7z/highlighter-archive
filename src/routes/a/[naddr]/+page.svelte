<script lang="ts">
    import MyHighlightsIcon from '$lib/icons/MyHighlights.svelte';
    import GlobalIcon from '$lib/icons/Global.svelte';
    import FollowsIcon from '$lib/icons/Follows.svelte';
	import RadioButton from '$lib/components/buttons/radio.svelte';
	import Highlight from '$lib/components/Highlight.svelte';
    import { page } from '$app/stores';
    import ArticleInterface from '$lib/interfaces/article';
    import HighlightInterface from '$lib/interfaces/highlights';
    import NoteInterface from '$lib/interfaces/notes';
    import { onMount } from 'svelte';
    import { Tooltip } from 'flowbite-svelte';
    import Widget from '../../../Widget.svelte';
    import MarkdownIt from 'markdown-it';
    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import Article from '$lib/components/Article.svelte';
    import { getText, getParagraph, getSentence } from 'get-selection-more'

    const { naddr } = $page.params;

    let mode = 'global';

    function setMode() {
        switch (mode) {
            case 'my':
                myHighlights();
                break;
            case 'global':
                globalHighlights();
                break;
            case 'network':
                alert('coming soon™️!');
                break;
        }
    }

    let articles;
    let _articles: App.Article[] = [];
    let article: App.Article;
    let content: string = '';

    let highlights;
    let _highlights: App.Highlight[] = [];

    let notes;
    let _notes: App.Note[] = [];

    onMount(async () => {
        document.addEventListener('selectionchange', () => {
            console.log({
                getText: getText(),
                getParagraph: getParagraph(),
                getSentence: getSentence()
            });
        })
        setTimeout(() => {
            articles = ArticleInterface.load({naddr});
            highlights = HighlightInterface.load({articleNaddr: naddr});
            notes = NoteInterface.load({articleNaddr: naddr});
        }, 1000);
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
                content = content.replace(highlight.content, `<mark data-highlight-id="${highlight.id}">${highlight.content}</mark>`);
            }
        }
    }
</script>

{#if article}
    <div class="flex flex-col sm:flex-row w-screen sm:gap-12">
        <div class="sm:w-3/5 text-lg p-8 bg-slate-50 shadow-lg text-justify text-slate-700 leading-loose flex flex-col gap-2">
            <!-- Title -->
            <h1 class="text-3xl sm:text-5xl font-black font-sans leading-normal">{article.title}</h1>

            <div class="flex flex-row justify-between">
                <!-- Author / URL -->
                {#if article?.author}
                    <h2 class="flex flex-row items-center text-sm sm:text-sm gap-4">
                        <div class="flex flex-row gap-4 items-start">
                            <Avatar userProfile={{id:article.author}} klass="h-8" />
                            <div class=" text-gray-500 text-lg">
                                <Name userProfile={{id:article.author}} />
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
                            <Avatar userProfile={{id:article.publisher}} klass="h-10" />
                            <Name userProfile={{id:article.publisher}} />
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
        </div>

        <!-- Sidebar -->
        <div class="sm:w-2/5 p-8 pt-4 sm:h-screen sm:overflow-scroll sm:fixed right-0">
            <div class="flex flex-row items-center justify-between mb-8">
                <div>
                    <a href="/" class="
                        text-gray-300 hover:text-white
                        font-semibold
                    " name="highlights">
                        ⚡️ ZAPWORDTHY
                    </a>
                </div>

                <div class="flex flex-row text-slate-300 items-center justify-center
                    text-xs sm:text-lg
                ">
                    <RadioButton bind:group={mode} on:change={setMode} value="my">
                        <MyHighlightsIcon />
                    </RadioButton>
                    <Tooltip placement="bottom">My Highlights</Tooltip>

                    <RadioButton bind:group={mode} on:change={setMode} value="global">
                        <GlobalIcon />
                    </RadioButton>
                    <Tooltip placement="bottom">Global Highlights Feed</Tooltip>

                    <RadioButton bind:group={mode} on:change={setMode} value="network">
                        <FollowsIcon />
                    </RadioButton>
                    <Tooltip placement="bottom">Highlights from people you follow</Tooltip>
                </div>
            </div>

            {#if _highlights}
                <div class="flex flex-col gap-6">
                    {#each _highlights as highlight}
                        <Highlight {highlight} skipUrl={true} />
                    {/each}
                </div>
            {/if}
        </div>
    </div>

    <Widget loadHighlights={false} position="bottom-5 left-5 flex-col-reverse" />
{/if}

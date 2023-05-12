<script lang="ts">
    import HighlightInterface from '$lib/interfaces/highlights';
    import NoteInterface from '$lib/interfaces/notes';
    // import Widget from '../../../../Widget.svelte';
    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import Article from '$lib/components/Article.svelte';
    import type { NDKEvent } from '@nostr-dev-kit/ndk';
    import type { NDKSubscription } from '@nostr-dev-kit/ndk';
    import ScopeDropdown from '$lib/components/ScopeDropdown.svelte';
    import HighlightList from '$lib/components/HighlightList.svelte';
    import HighlightListItemForm from '$lib/components/HighlightListItemForm.svelte';
    import { currentUser, currentUserFollowPubkeys, ndk } from '$lib/store';
    import HighlightWrapper from '$lib/components/HighlightWrapper.svelte';
    import { fade } from 'svelte/transition';
    import { fetchFollowers } from '$lib/currentUser';

    export let article: App.Article;
    export let articleEvent: NDKEvent;
    export let content: string;
    export let unmarkedContent: string;

    let articleId: string;

    $: if (article?.id && article?.id !== articleId) {
        articleId = article.id;
        notes = NoteInterface.load({articleId});
    }

    let scope = 'personal';
    let currentScope: string;

    let highlightFilter: any;
    let currentHighlightFilter: any;

    let highlights: any;

    let notes;
    let activeSub: NDKSubscription[] | undefined;

    // Set filter for current view
    $: if (scope !== currentScope) {
        let pubkeys: string[] | undefined | null = null;

        if (scope === 'network') {
            // check if we have the contacts loaded
            if (!$currentUserFollowPubkeys) {
                fetchFollowers();
            } else {
                // update the filter
                pubkeys = $currentUserFollowPubkeys;
            }
        } else if (scope === 'personal' && $currentUser?.hexpubkey()) {
            pubkeys = [$currentUser?.hexpubkey()];
        } else if (scope === 'global') {
            pubkeys = undefined;
        }

        // If pubkeys has been explicitly set to a value or undefined
        if (pubkeys !== null) {
            highlightFilter = {pubkeys, articleId};
            currentScope = scope;
        }
    }

    // Apply filter when it's ready
    $: if (highlightFilter !== currentHighlightFilter) {
        console.log({highlightFilter, currentHighlightFilter});
        currentHighlightFilter = highlightFilter;

        highlights = HighlightInterface.load(highlightFilter);
        activeSub = HighlightInterface.startStream(highlightFilter);
    }

    let markedHighlightCount = 0;

    $: if ($highlights && $highlights.length > 0 && markedHighlightCount !== $highlights.length) {
        markContent();
        markedHighlightCount = $highlights.length;
    }

    function markContent() {
        content = unmarkedContent;

        for (const highlight of $highlights||[]) {
            // if (replacedHighlights[highlight.id!]) continue;
            content = content.replace(highlight.content, `<mark data-highlight-id="${highlight.id}">${highlight.content}</mark>`);
            // replacedHighlights[highlight.id!] = true;
        }
    }

    let newHighlightItem: App.Highlight | undefined;

    function onSelectionChange(e: Event) {
        let {selection, sentence, paragraph } = e.detail;

        selection = selection.trim();
        sentence = sentence.trim();

        console.log({selection, sentence, paragraph});


        if (selection.length >= sentence.length) {
            sentence = undefined;
        }


        if (selection.trim() === '') return;

        if (selection) {
            newHighlightItem = {
                id: undefined,
                articleId,
                content: selection,
                pubkey: $currentUser?.hexpubkey()!,
                scope,
                context: sentence,
            };
        }
    }

    function onNewHighlightCancel() {
        newHighlightItem = undefined;
    }
</script>

<svelte:head>
    <title>{article?.title || "Highlighter.com"}</title>
</svelte:head>

<div class="flex flex-row sm:flex-row w-full mx-auto px-6">
    <div class="
        rounded-b-lg shadow-sm
        text-lg p-8 text-justify leading-loose flex flex-col gap-2
        bg-white rounded-xl w-7/12
        overflow-auto
    ">
        {#if article}
            <!-- Title -->
            <h1 class="text-2xl font-bold font-sans leading-normal text-left">{article.title}</h1>

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
            <HighlightWrapper on:selectionchange={onSelectionChange}>
                <article class="my-6 font-serif">
                    <Article>
                        {@html content}
                    </Article>
                </article>
            </HighlightWrapper>
        {/if}
    </div>

    <!-- Sidebar -->
    <div class="relative">
        <div class="px-4 h-screen fixed overflow-auto w-5/12">
            <div class="flex flex-row justify-end mb-4">
                <ScopeDropdown bind:scope />
            </div>

            {#if newHighlightItem}
                <div class="mb-8" transition:fade>
                    <HighlightListItemForm
                        {articleEvent}
                        highlight={newHighlightItem}
                        on:cancel={onNewHighlightCancel}
                    />
                </div>
            {/if}

            <div class="
                {newHighlightItem ? 'opacity-50' : ''}
                transition duration-100
            ">
                {#if article && highlightFilter}
                    {#key highlightFilter}
                        <HighlightList
                            skipTitle={true}
                            items={highlights}
                            {article}
                        />
                    {/key}
                {/if}
            </div>
        </div>
    </div>
</div>

<!-- <Widget loadHighlights={false} position="bottom-5 left-5 flex-col-reverse" /> -->

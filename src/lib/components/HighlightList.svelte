<script lang="ts">
    import CopyIcon from '$lib/icons/Copy.svelte';
    import ZapIcon from '$lib/icons/Zap.svelte';
    import CommentIcon from '$lib/icons/Comment.svelte';

    import { Badge, Tooltip } from 'flowbite-svelte';


    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import { ndk } from '$lib/store';
    import { NDKEvent } from '@nostr-dev-kit/ndk';
    import {nip19} from 'nostr-tools';
    import Comment from '$lib/components/Comment.svelte';
    import Note from '$lib/components/Note.svelte';
    import NoteInterface from '$lib/interfaces/notes';
    import ArticleInterface from '$lib/interfaces/article';
    import { onMount } from 'svelte';

    export let highlight: App.Highlight;
    export let skipUrl: boolean = false;

    let replies;
    let articles, article;

    onMount(() => {
        if (highlight?.id) {
            replies = NoteInterface.fromCacheRepliesTo(highlight.id);

            articles = ArticleInterface.load({ id: highlight.articleId });
        }
    });

    $: {
        if ($articles) article = $articles[0];
    }

    // extract the domain name from the url
    const domain = new URL(highlight.url).hostname;
    const event = new NDKEvent($ndk, JSON.parse(highlight.event));
    let showComment = false;
    let showReplies = false;

    function urlFor(highlight: App.Highlight) {
        if (highlight.articleId) {
            const [kind, pubkey, identifier] = highlight.articleId.split(':');
            const naddr = nip19.naddrEncode({
                kind: parseInt(kind),
                pubkey,
                identifier
            })
            return `/a/${naddr}`;
        }
    }
</script>

<div class="
    flex flex-col h-full gap-4
    border border-gray-950 hover:border-gray-900
    p-6 rounded-xl
    bg-gray-1100 hover:bg-gray-950
" style="max-height: 40rem;">
    <div class="flex flex-col gap-2">
        <a href={urlFor(highlight)} class="
            text-gray-600
            font-semibold text-2xl
            font-serif
        ">
            {article?.title||'Untitled'}
        </a>
        {#if article?.author}
            <div class="flex flex-row gap-4 items-start">
                <Avatar userProfile={{id:article.author}} klass="h-8" />
                <div class=" text-gray-500 text-lg">
                    <Name userProfile={{id:article.author}} />
                </div>
            </div>
        {:else if article?.url}
            <div class="text-slate-600 text-xs">
                {article.url}
            </div>
        {/if}
    </div>

    <!-- Content -->
    <a href={urlFor(highlight)} class="
        text-lg leading-relaxed text-gray-200 h-full flex flex-col sm:text-justify
        px-6 py-4
        my-2
        border-l border-slate-500
        overflow-auto
    ">
        {highlight.content}
    </a>

    <!-- Footer -->
    <div class="
        flex flex-row
        items-center
        justify-between
        w-full
        rounded-b-lg
        p-4
        pb-0
    ">
        <div class="flex flex-row gap-4 items-center">
            <div class="flex flex-row gap-4 items-start">
                <Avatar userProfile={{id:highlight.pubkey}} klass="h-6" />
                <div class=" text-gray-500 text-base hidden sm:block">
                    <Name userProfile={{id:highlight.pubkey}} />
                </div>
            </div>
            {#if $replies && $replies.length > 0}
                <button class="text-sm text-gray-500"
                    on:click={() => { showReplies = !showReplies }}
                >
                    <span class=" px-4 py-2  rounded-xl flex flex-col items-center justify-center text-xs">
                        {$replies.length} comments
                    </span>
                </button>
                <Tooltip>
                    View comments
                </Tooltip>
            {/if}
        </div>

        <div class="flex flex-row gap-4 items-center">
            <button class="text-slate-500 hover:text-purple-700"><ZapIcon /></button>
            <Tooltip>Zap</Tooltip>

            <button
                class="text-slate-500 hover:text-purple-700"
                on:click={() => { console.log('change', showComment); showComment = !showComment }}
            >
                <CommentIcon />
            </button>
            <Tooltip>Discuss</Tooltip>

            {#if !skipUrl}
                {#if highlight.articleId}
                    <button class="flex flex-row gap-2 items-center text-slate-500 hover:text-purple-700">
                        <CopyIcon />
                        <span class="text-xs">NIP-23</span>
                    </button>
                    <Tooltip>
                        This is a Nostr-native post; copy it's <code>naddr.</code>
                    </Tooltip>

                {:else if highlight.url}
                    <a href={highlight.url} class="text-gray-500 hover:text-purple-400 flex flex-row gap-3 text-sm items-center">
                        {domain}
                    </a>
                    <Tooltip>
                        {highlight.url}
                    </Tooltip>
                {/if}
            {/if}
        </div>
    </div>

    <div class={(showComment ? `block` : 'hidden') + " w-full text-gray-200 text-lg"}>
        <Comment op={event} on:commented={() => { showComment = false }} />
    </div>
</div>

<div class="w-full ml-12 {showReplies ? 'block' : 'hidden'}">
    {#if $replies}
        {#each $replies as reply}
            <Note note={reply} />
        {/each}
    {/if}
</div>
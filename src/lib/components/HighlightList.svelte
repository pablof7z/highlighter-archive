<script lang="ts">
    import NoteInterface from '$lib/interfaces/notes';
    import ArticleInterface from '$lib/interfaces/article';
    import ZapInterface from '$lib/interfaces/zap';

    import CopyIcon from '$lib/icons/Copy.svelte';
    import CheckIcon from '$lib/icons/Check.svelte';
    import ViewIcon from '$lib/icons/View.svelte';
    import ZapIcon from '$lib/icons/Zap.svelte';
    import CommentIcon from '$lib/icons/Comment.svelte';
    import BookmarkIcon from '$lib/icons/Bookmark.svelte';

    import { openModal } from 'svelte-modals'

    import { Tooltip } from 'flowbite-svelte';

    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import { ndk } from '$lib/store';
    import { NDKEvent } from '@nostr-dev-kit/ndk';
    import {nip19} from 'nostr-tools';
    import Comment from '$lib/components/Comment.svelte';
    import Note from '$lib/components/Note.svelte';
    import ZapModal from '$lib/modals/Zap.svelte';
    import { onMount } from 'svelte';

    export let highlight: App.Highlight;
    export let skipUrl: boolean = false;
    export let skipTitle: boolean = false;
    let prevHighlightId: string | undefined = undefined;

    let replies;
    let articles, article: App.Article | undefined;
    let zaps;
    let zap = false;
    let zappedAmount: number;
    let domain: string;
    let pubkey: string;
    let showComments = false;
    let showReplies = false;
    let event: NDKEvent;
    let articleLink: string;
    let naddr: string;
    let copiedNaddr = false;

    function copyNaddr() {
        navigator.clipboard.writeText(naddr);
        copiedNaddr = true;
        setTimeout(() => {
            copiedNaddr = false;
        }, 1500);
    }

    function onContentClick(e) {
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
        }
    }

    $: {
        if (prevHighlightId !== highlight.id && highlight.id) {
            article = undefined;
            showComments = false;
            showReplies = false;
            prevHighlightId = highlight.id;

            if (highlight.articleId) {
                const [kind, pubkey, identifier] = highlight.articleId.split(':');
                naddr = nip19.naddrEncode({
                    kind: parseInt(kind),
                    pubkey,
                    identifier
                })
                articleLink = `/a/${naddr}`;
            }

            replies = NoteInterface.load({ replies: [highlight.id] });
            zaps = ZapInterface.load({eventId: highlight.id});

            if (highlight.articleId) {
                articles = ArticleInterface.load({ id: highlight.articleId });
            }
        }

        if ($articles) article = $articles[0];

        if (!event || event.id !== highlight.id) {
            event = new NDKEvent($ndk, JSON.parse(highlight.event));
        }

        // count zap amount
        if ($zaps) {
            zappedAmount = $zaps.reduce((acc, zap) => {
                return acc + zap.amount;
            }, 0);
        }

        pubkey = highlight.pubkey;

        domain = new URL(highlight.url).hostname;
    }

</script>

<div class="
    flex flex-col h-full gap-4
    border border-gray-950 hover:border-gray-900
    px-6 pt-6 pb-4 rounded-xl
    bg-gray-1100 hover:bg-gray-950
    transition duration-100
" style="max-height: 40rem;">

    {#if !skipTitle}
        <!-- Title -->
        <div class="flex flex-row justify-between items-start overflow-clip">
            <div class="flex flex-col gap-2 whitespace-nowrap text-ellipsis">
                <a href={articleLink} class="
                    text-gray-600
                    font-semibold text-2xl
                    font-serif
                ">
                    {article?.title||domain||'Untitled'}
                </a>
                {#if article?.author}
                    <div class="flex flex-row gap-4 items-start">
                        <Avatar pubkey={article.author} klass="h-8" />
                        <div class=" text-gray-500 text-lg whitespace-nowrap">
                            <Name pubkey={article.author} />
                        </div>
                    </div>
                {:else if article?.url}
                    <div class="text-slate-600 text-xs">
                        {article.url}
                    </div>
                {/if}
            </div>

            <button class="text-gray-700 hover:text-gray-400 transition duration-300 w-fit"
                on:click={() => {
                    navigator.clipboard.writeText(highlight.event);
                }}
            >
                <ViewIcon />
            </button>
            <Tooltip>Copy event JSON</Tooltip>
        </div>
    {/if}

    <!-- Content -->
    <a href={articleLink} on:click={onContentClick} class="
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
        py-4
        pb-0
        overflow-clip
    ">
        <div class="flex flex-row gap-4 items-center whitespace-nowrap">
            <div class="flex flex-row gap-4 items-start">
                <Avatar pubkey={highlight.pubkey} klass="h-6" />
                <div class=" text-gray-500 text-base hidden sm:block">
                    <Name pubkey={highlight.pubkey} />
                </div>
            </div>
            {#if ($replies||[]).length > 0}
                <button class="text-sm text-gray-500"
                    on:click={() => { showReplies = !showReplies }}
                >
                    <span class=" px-4 py-2 rounded-xl flex flex-col items-center justify-center text-xs">
                        {($replies||[]).length} comments
                    </span>
                </button>
                <Tooltip>
                    View comments
                </Tooltip>
            {/if}
        </div>

        <div class="flex flex-row gap-4 items-center">
            <button class="
                text-slate-500 hover:text-orange-500
                flex flex-row items-center gap-2
            " on:click={() => { openModal(ZapModal, { highlight, article }) }}>
                <ZapIcon />
                {zappedAmount}
            </button>
            <Tooltip>Zap</Tooltip>

            <button class="
                text-slate-500 hover:text-orange-500
                flex flex-row items-center gap-2
            " on:click={() => {}}>
                <BookmarkIcon />
            </button>
            <Tooltip>Bookmark</Tooltip>

            <button class="
                text-slate-500 hover:text-orange-500
                flex flex-row items-center gap-2
            " on:click={() => { showComments = !showComments }}>
                <CommentIcon />
                {($replies||[]).length}
            </button>
            <Tooltip>Discuss</Tooltip>

            {#if !skipUrl}
                {#if highlight.articleId}
                    <button class="
                        flex flex-row gap-2 items-center text-slate-500 hover:text-orange-500
                    " on:click={copyNaddr}>
                        {#if copiedNaddr}
                            <CheckIcon />
                            <span class="text-xs">Copied</span>
                        {:else}
                            <CopyIcon />
                            <span class="text-xs">NIP-23</span>
                        {/if}
                    </button>
                    <Tooltip>
                        This is a Nostr-native post; copy it's <code>naddr.</code>
                    </Tooltip>

                {:else if highlight.url}
                    <a href={highlight.url} class="text-gray-500 hover:text-orange-500 flex flex-row gap-3 text-sm items-center">
                        {domain}
                    </a>
                    <Tooltip>
                        {highlight.url}
                    </Tooltip>
                {/if}
            {/if}
        </div>
    </div>

    <div class={(showComments ? `block` : 'hidden') + " w-full text-gray-200 text-lg"}>
        <Comment op={event} on:commented={() => { showComments = false }} />
    </div>
</div>

<div class="w-full ml-12 {showReplies ? 'block' : 'hidden'}">
    {#each ($replies||[]) as reply}
        <Note note={reply} />
    {/each}
</div>
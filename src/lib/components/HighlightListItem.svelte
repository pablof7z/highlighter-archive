<script lang="ts">
    import NoteInterface from '$lib/interfaces/notes';

    import CopyIcon from '$lib/icons/Copy.svelte';
    import CheckIcon from '$lib/icons/Check.svelte';
    import ViewIcon from '$lib/icons/View.svelte';
    import CommentIcon from '$lib/icons/Comment.svelte';
    import LinkIcon from '$lib/icons/Link.svelte';

    import { Tooltip } from 'flowbite-svelte';

    import BookmarkButton from '$lib/components/events/buttons/bookmark.svelte';
    import ZapsButton from '$lib/components/events/buttons/zaps.svelte';
    import BoostButton from '$lib/components/events/buttons/boost.svelte';

    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import ndk from '$lib/stores/ndk';
    import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
    import {nip19} from 'nostr-tools';
    import Comment from '$lib/components/Comment.svelte';
    import Note from '$lib/components/Note.svelte';

    export let article: App.Article | undefined = undefined;
    export let highlight: App.Highlight;
    export let skipUrl: boolean = false;
    export let skipTitle: boolean = false;
    export let disableClick: boolean = false;
    let prevHighlightId: string | undefined = undefined;

    let replies, quotes;
    let domain: string;
    let pubkey: string;
    let showComments = false;
    let showReplies = false;
    let event: NDKEvent;
    let articleLink: string;
    let naddr: string;
    let copiedEventId = false;
    let highlightNoteId = '';
    let highlightUser = new NDKUser({hexpubkey: highlight.pubkey});
    let niceTime: string;

    function copyId() {
        if (!highlightNoteId) return;
        navigator.clipboard.writeText(highlightNoteId);
        copiedEventId = true;
        setTimeout(() => {
            copiedEventId = false;
        }, 1500);
    }

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
            showComments = false;
            showReplies = false;
            prevHighlightId = highlight.id;
            niceTime = new Date(highlight.timestamp * 1000).toLocaleString();

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

            replies = NoteInterface.load({ replies: [highlight.id] });
            quotes = NoteInterface.load({ quotes: [highlight.id] });
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

<div class="flex flex-col gap-4">
    <div class="
        rounded-md bg-white px-6 py-4 shadow
        flex flex-col h-full gap-4
        transition duration-100
        group
    " style="max-height: 40rem;">

        {#if !skipTitle}
            <!-- Title -->
            <div class="flex flex-row justify-between items-start relative">
                <div class="flex flex-col gap-2">
                    <a href={articleLink} class="
                        font-bold text-2xl
                        font-sans
                    ">
                        {article?.title||domain||'Untitled'}
                    </a>
                    {#if article?.author}
                        <div class="flex flex-row gap-4 items-start">
                            <Avatar pubkey={article.author} klass="h-8" />
                            <div class="text-lg">
                                <Name pubkey={article.author} />
                            </div>
                        </div>
                    {:else if article?.url}
                        <div class="text-slate-600 text-xs">
                            {article.url}
                        </div>
                    {/if}
                </div>

                <div class="
                    flex flex-col gap-4 absolute -right-14
                    opacity-0 group-hover:opacity-100 transition duration-300
                ">
                    <button class="text-gray-700 hover:text-gray-400 transition duration-300 w-fit"
                        on:click={() => {
                            navigator.clipboard.writeText(highlight.event);
                        }}
                    >
                        <ViewIcon />
                    </button>
                    <Tooltip color="black">Copy event JSON</Tooltip>

                    <button class="
                        flex flex-row gap-2 items-center text-slate-500 hover:text-orange-500
                    " on:click={copyId}>
                        {#if copiedEventId}
                            <CheckIcon />
                        {:else}
                            <CopyIcon />
                        {/if}
                    </button>
                    <Tooltip  color="black">
                        Copy highlight Nostr ID
                    </Tooltip>
                </div>
            </div>
        {/if}

        <!-- Content -->
        <a href={articleLink} on:click={onContentClick} class="
            leading-relaxed h-full flex flex-col
            px-6 py-4
            my-2
            border-l border-slate-500
            overflow-auto
        ">
            {highlight.content}
        </a>

        {#if $quotes}
            {#each $quotes as quote}
                <div class="text-lg">
                    {quote.content.replace(/\nnostr:(.*)$/, '')}
                </div>
            {/each}
        {/if}

        <!-- Footer -->
        <div class="
            flex flex-row
            items-center
            justify-between
            w-full
            rounded-b-lg
            py-4 pb-0
            relative
        ">
            <div class="flex flex-row gap-4 items-center whitespace-nowrap">
                <a
                    href="/p/{highlightUser.npub}"
                    class="flex flex-row gap-4 items-center justify-center">
                    <Avatar pubkey={highlight.pubkey} klass="h-6" />
                    <div class=" text-gray-500 text-xs hidden sm:block">
                        <Name pubkey={highlight.pubkey} />
                    </div>
                </a>
            </div>

            <div class="
                absolute bottom-0 right-0
                opacity-100 group-hover:opacity-0
                transition duration-300
                text-xs text-slate-500
                z-0
            ">
                {niceTime}
            </div>

            <div class="
                flex flex-row gap-4 items-center
                opacity-0 group-hover:opacity-100
                transition duration-300
                z-10
            ">
                <BookmarkButton {event} />

                <ZapsButton {highlight} />

                <BoostButton {highlight} {event} />

                <button class="
                    text-slate-500 hover:text-orange-500
                    flex flex-row items-center gap-2
                " on:click={() => { showComments = !showComments; showReplies = showComments; }}>
                    <CommentIcon />
                    {($replies||[]).length}
                </button>
                <Tooltip  color="black">Discuss</Tooltip>

                {#if highlight.url && !skipUrl}
                    <a href={highlight.url} class="text-gray-500 hover:text-orange-500 flex flex-row gap-3 text-sm items-center">
                        {domain}
                    </a>
                    <Tooltip  color="black">
                        {highlight.url}
                    </Tooltip>
                {/if}

                <a href={`/e/${highlightNoteId}`} class="
                    text-slate-500 hover:text-orange-500
                    flex flex-row items-center gap-2
                ">
                    <LinkIcon />
                </a>
                <Tooltip  color="black">Link to this highlight</Tooltip>
            </div>
        </div>

        <div class={(showComments ? `block` : 'hidden') + " w-full text-gray-200 text-lg"}>
            <Comment op={event} on:commented={() => { showComments = false }} />
        </div>
    </div>

    <div class="ml-6 flex flex-col gap-6 {showReplies ? 'block' : 'hidden'}">
        {#each ($replies||[]) as reply}
            <Note note={reply} />
        {/each}
    </div>
</div>
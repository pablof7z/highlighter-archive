<script lang="ts">
    import Avatar from '$lib/components/Avatar.svelte';
    import { ndk, } from '$lib/store';
    import { NDKEvent } from '@nostr-dev-kit/ndk';
    import {nip19} from 'nostr-tools';
    import Comment from '$lib/components/Comment.svelte';
    import Note from '$lib/components/Note.svelte';
    import NoteInterface from '$lib/interfaces/notes';
    import ArticleInterface from '$lib/interfaces/article';

    import BoostIcon from '$lib/icons/Boost.svelte';
    import ZapIcon from '$lib/icons/Zap.svelte';
    import CommentIcon from '$lib/icons/Comment.svelte';
    import BookmarkIcon from '$lib/icons/Bookmark.svelte';

    import ZapModal from '$lib/modals/Zap.svelte';
    import BookmarkModal from '$lib/modals/Bookmark.svelte';

    import { onMount } from 'svelte';
    import { Tooltip } from 'flowbite-svelte';
    import { openModal } from 'svelte-modals'

    export let highlight: App.Highlight;
    export let skipUrl: boolean = false;

    let replies;
    let quotes;
    let article;

    onMount(() => {
        if (highlight?.id) {
            replies = NoteInterface.load({ replies: [highlight.id] });
            quotes = NoteInterface.load({ quotes: [highlight.id] });

            if (highlight.articleId) {
                article = ArticleInterface.load({ id: highlight.articleId });
            } else if (highlight.url) {
                article = ArticleInterface.load({ url: highlight.url });
            }
        }
    });

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

    function onClick(e) {
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
</script>

<div class="
    border border-gray-200 rounded-lg
    bg-white
    shadow
">
    <div class="flex flex-col items-center h-full">
        <a href={urlFor(highlight)} class="
            text-lg mt-2 px-6 py-4 text-slate-700 h-full justify-center items-center flex flex-col text-justify
        " on:click={onClick}>
            {highlight.content}
        </a>

        <div class="
            flex flex-row
            items-center
            justify-between
            w-full
            rounded-b-lg
            px-4 pb-4
        ">
            <div class="flex flex-row gap-4 items-center">
                <Avatar userProfile={{id:highlight.pubkey}} klass="h-8" />

                {#if $replies && $replies.length > 0}
                    <button class="text-sm text-gray-500"
                        on:click={() => { showReplies = !showReplies }}
                    >
                        {$replies.length} comments
                    </button>
                {/if}
            </div>

            <div class="flex flex-row gap-4 items-center">
                <button
                    class="text-slate-500 hover:text-purple-700"
                    on:click={() => { openModal(BookmarkModal, { highlight, article }) }}
                ><BookmarkIcon /></button>
                <Tooltip  color="black">Bookmark</Tooltip>

                <button
                    class="text-slate-500 hover:text-purple-700"
                    on:click={() => { openModal(ZapModal, { highlight, article }) }}
                ><ZapIcon /></button>
                <Tooltip  color="black">Zap</Tooltip>

                <button class="text-slate-500 hover:text-purple-700">
                    <BoostIcon />
                </button>
                <Tooltip  color="black">Boost</Tooltip>

                <button
                    class="text-slate-500 hover:text-purple-700"
                    on:click={() => { console.log('change', showComment); showComment = !showComment }}
                >
                    <CommentIcon />
                </button>
                {#if !skipUrl}
                    <a href={highlight.url} class="text-purple-500 hover:text-purple-400 flex flex-row gap-3 text-sm items-center">
                        {domain}
                    </a>
                {/if}
            </div>
        </div>

        <div class={(showComment ? `block` : 'hidden') + " w-full"}>
            <Comment op={event} on:commented={() => { showComment = false }} />
        </div>
    </div>
</div>

<div class="ml-6 {showReplies ? 'block' : 'hidden'}">
    {#if $replies}
        {#each $replies as reply}
            <Note note={reply} />
        {/each}
    {/if}
</div>
<script lang="ts">
    import NoteInterface from '$lib/interfaces/notes';
    import ZapInterface from '$lib/interfaces/zap';

    import BoostIcon from '$lib/icons/Boost.svelte';
    import ZapIcon from '$lib/icons/Zap.svelte';
    import CommentIcon from '$lib/icons/Comment.svelte';
    import BookmarkIcon from '$lib/icons/Bookmark.svelte';
    import LinkIcon from '$lib/icons/Link.svelte';

    import { openModal } from 'svelte-modals'
    import { Tooltip } from 'flowbite-svelte';

    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import { ndk } from '$lib/store';
    import { NDKEvent } from '@nostr-dev-kit/ndk';
    import {nip19} from 'nostr-tools';
    import Comment from '$lib/components/Comment.svelte';

    import ZapModal from '$lib/modals/Zap.svelte';
    import BookmarkModal from '$lib/modals/Bookmark.svelte';

    import type { NostrEvent } from '@nostr-dev-kit/ndk/lib/src/events';

    export let note: App.Note;
    let prevNoteId: string | undefined = undefined;

    let replies;
    let zaps;
    let zappedAmount: number = 0;
    let pubkey: string;
    let showComments = false;
    let showReplies = false;
    let event: NDKEvent;
    let copiedEventId = false;
    let noteId = '';
    let niceTime: string;

    function copyId() {
        if (!noteId) return;
        navigator.clipboard.writeText(noteId);
        copiedEventId = true;
        setTimeout(() => {
            copiedEventId = false;
        }, 1500);
    }

    async function boost() {
        let noteEvent = new NDKEvent($ndk, JSON.parse(note.event));

        const tags = [];
        tags.push(noteEvent.tagReference());

        const pTag = noteEvent.getMatchingTags('p')[0];
        if (pTag && pTag[1]) {
            tags.push(['p', pTag[1], "highlighter"]);
        }

        const boostEvent = new NDKEvent($ndk, {
            content: JSON.stringify(noteEvent.rawEvent()),
            created_at: Math.floor(Date.now() / 1000),
            kind: 6,
            tags,
        } as NostrEvent);

        await boostEvent.sign();
        console.log('boostEvent', await boostEvent.toNostrEvent());
        await boostEvent.publish();

        alert('event boosted; displaying boosts is WIP -- BRB! 😉')
    }

    $: {
        if (prevNoteId !== note.id && note.id) {
            showComments = false;
            showReplies = false;
            prevNoteId = note.id;

            noteId = nip19.noteEncode(note.id);

            replies = NoteInterface.load({ replies: [note.id] });
            zaps = ZapInterface.load({eventId: note.id});
        }

        if (!event || event.id !== note.id) {
            event = new NDKEvent($ndk, JSON.parse(note.event));
        }

        // count zap amount
        if ($zaps) {
            zappedAmount = $zaps.reduce((acc, zap) => {
                return acc + zap.amount;
            }, 0);
        }

        pubkey = note.pubkey;

        niceTime = new Date(note.createdAt * 1000).toLocaleString();
    }

    function dragStart(event: DragEvent) {
        if (!event.dataTransfer) return;

        const e = new NDKEvent($ndk, JSON.parse(note.event));
        const tag = e.tagReference();

        event.dataTransfer.setData('id', note.id as string);
        event.dataTransfer.setData('tag', JSON.stringify(tag));
    }


</script>

<div
    class="flex flex-col h-full"
    draggable={true}
    on:dragstart={dragStart}
>
    <div class="
        shadow
        flex flex-col h-full gap-4
        border border-zinc-200 hover:border-zinc-200
        px-6 pt-6 pb-4 rounded-xl
        bg-white hover:bg-slate-50 transition duration-200 ease-in-out
    " style="max-height: 40rem;">
        <div class="flex flex-row items-center justify-between">

            <!-- Header -->
            <div class="flex flex-row gap-4 items-center justify-center">
                <Avatar pubkey={note.pubkey} klass="h-6" />

                <div class="text-sm text-zinc-600 font-semibold">
                    <Name pubkey={note.pubkey} />
                </div>
            </div>

            <div class="text-zinc-400">
                {niceTime}
            </div>
        </div>

                <!-- <button class="text-gray-200 hover:text-gray-400 transition duration-300 w-fit"
                    on:click={() => {
                        navigator.clipboard.writeText(note.event);
                    }}
                >
                    <ViewIcon />
                </button>
                <Tooltip>Copy event JSON</Tooltip> -->

        <!-- Content -->
        <div class="
            leading-relaxed
            h-full flex flex-col sm:text-justify
            text-black
            my-2
            overflow-auto
        ">
            {note.content}
        </div>

        <!-- Footer -->
        <div class="
            flex flex-row
            items-center
            justify-between
            w-full
            rounded-b-lg
            py-4
            pb-0
        ">
            <div class="flex flex-row gap-4 items-center whitespace-nowrap">
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
                <button
                    class="text-slate-500 hover:text-purple-700"
                    on:click={() => { openModal(BookmarkModal, { event: note.event }) }}
                ><BookmarkIcon /></button>
                <Tooltip>Bookmark</Tooltip>

                <button class="
                    text-slate-500 hover:text-orange-500
                    flex flex-row items-center gap-2
                " on:click={() => { openModal(ZapModal, { note, article }) }}>
                    <ZapIcon />
                    {zappedAmount}
                </button>
                <Tooltip>Zap</Tooltip>

                <button class="
                    text-slate-500 hover:text-orange-500
                    flex flex-row items-center gap-2
                " on:click={boost}>
                    <BoostIcon />
                </button>
                <Tooltip>Boost</Tooltip>

                <button class="
                    text-slate-500 hover:text-orange-500
                    flex flex-row items-center gap-2
                " on:click={() => { showComments = !showComments; showReplies = showComments; }}>
                    <CommentIcon />
                    {($replies||[]).length}
                </button>
                <Tooltip>Discuss</Tooltip>

                <a href={`/e/${noteId}`} class="
                    text-slate-500 hover:text-orange-500
                    flex flex-row items-center gap-2
                ">
                    <LinkIcon />
                </a>
                <Tooltip>Link to this note</Tooltip>
            </div>
        </div>

        <div class={(showComments ? `block` : 'hidden') + " w-full text-gray-200 text-lg"}>
            <Comment op={event} on:commented={() => { showComments = false }} />
        </div>
    </div>

    <div class="flex flex-col gap-6 pt-6 ml-6 {showReplies ? 'block' : 'hidden'}">
        {#each ($replies||[]) as reply}
            <svelte:self note={reply} />
        {/each}
    </div>
</div>
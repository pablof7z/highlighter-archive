<script lang="ts">
	import CopyJson from './buttons/copy-json.svelte';
    import NoteInterface from '$lib/interfaces/notes';
    import NoteContent from './content.svelte';
    import Bookmark from '$lib/components/events/buttons/bookmark.svelte';
    import Zaps from './buttons/zaps.svelte';
    import Boost from './buttons/boost.svelte';

    import CommentIcon from '$lib/icons/Comment.svelte';
    import LinkIcon from '$lib/icons/Link.svelte';

    import { Tooltip } from 'flowbite-svelte';

    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import { currentUser, ndk } from '$lib/store';
    import { NDKEvent } from '@nostr-dev-kit/ndk';
    import {nip19} from 'nostr-tools';
    import Comment from '$lib/components/Comment.svelte';

    export let note: App.Note;
    export let skipFooter = false;
    export let skipHeader = false;
    export let compact = false;
    let prevNoteId: string | undefined = undefined;

    let replies;
    let pubkey: string;
    let showComments = false;
    let showReplies = false;
    let event: NDKEvent;
    let noteId = '';
    let niceTime: string;
    let title: string;
    let content: string;

    $: {
        if (prevNoteId !== note.id && note.id) {
            showComments = false;
            showReplies = false;
            prevNoteId = note.id;
            title = '';
            content = note.content;

            noteId = nip19.noteEncode(note.id);

            replies = NoteInterface.load({ replies: [note.id] });
        }

        if (!event || event.id !== note.id) {
            event = new NDKEvent($ndk, JSON.parse(note.event));
            const subjectTag = event.getMatchingTags('subject')[0];
            title = subjectTag ? subjectTag[1] : '';

            if (event.kind === 4) {
                setTimeout(async () => {
                    await event.decrypt($currentUser!);
                    content = event.content;

                    console.log('decrypt', content, event.content)

                    if (title && title.match(/iv/i)) {
                        try {
                            const decryptedTitle = await $ndk.signer?.decrypt($currentUser!, title);
                            if (decryptedTitle) title = decryptedTitle;
                        } catch (e) {
                            console.log('failed to decrypt', e)
                        }
                    }
                }, 1000 * Math.random())
            }
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

    let showCompact = compact;

    function toggleCompactView() {
        showCompact = (!showCompact || !compact);
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="relative flex flex-row w-full group" on:click={toggleCompactView}>
    <div
        class="flex flex-col h-full flex-grow"
        draggable={true}
        on:dragstart={dragStart}
    >
        <div class="
            shadow
            flex flex-col h-full gap-4
            border border-zinc-200 hover:border-zinc-200
            rounded-xl
            bg-white hover:bg-slate-50 transition duration-200 ease-in-out
            {showCompact ? 'px-6 py-4' : 'px-6 pt-6 pb-4'}
        " style="max-height: 40rem;">

            <!-- Header -->
            {#if !showCompact}
                <div class="flex flex-row items-center justify-between">
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
            {/if}

            <NoteContent note={content} tags={event.tags} title={event.kind === 4 ? title : undefined} />

            <!-- Footer -->
            {#if !showCompact}
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
                        <Bookmark {event}  />
                        <Zaps {note}  />
                        <Boost {note}  />

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
            {/if}

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

    {#if skipHeader}
        <div class="
            absolute top-4 right-4 text-xs text-zinc-400
            opacity-0 group-hover:opacity-100
            transition duration-100
        ">
            {niceTime}
        </div>
    {/if}

    <div class="
        absolute
        -right-14
        text-gray-200 group-hover:text-gray-600 transition duration-300
    ">
        <CopyJson {note} />
        <button class="
            {($replies||[]).length > 0 ? 'text-gray-600' : ''}
            flex flex-row items-center gap-2
        " on:click={() => { showComments = !showComments; showReplies = showComments; }}>
            <CommentIcon />
            {($replies||[]).length}
        </button>
    </div>
</div>
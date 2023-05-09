<script lang="ts">
	import CommentIcon from '$lib/icons/Comment.svelte';
    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import { ndk } from '$lib/store';
    import { NDKEvent } from '@nostr-dev-kit/ndk';
    import Comment from '$lib/components/Comment.svelte';
    import NoteInterface from '$lib/interfaces/notes';
    import { onMount } from 'svelte';
    import FormattedContent from '$lib/components/events/FormattedContent.svelte';

    export let note: App.Note | undefined = undefined;
    export let noteId: string | undefined = undefined;

    let _note = note;

    if (note) noteId = note.id;

    let replies;
    let noteQuery;

    onMount(() => {
        if (!note && noteId) {
            // send null so a kind won't be autoset to 1
            noteQuery = NoteInterface.load({ ids: [noteId], kind: null });
        }

        if (noteId) {
            replies = NoteInterface.load({ replies: [noteId] });
        }
    });

    // extract the domain name from the url
    let event: NDKEvent | undefined = undefined;
    let showComment = false;

    $: if ($noteQuery && !_note !== $noteQuery[0]) {
        _note = $noteQuery[0];
        console.log('setting it', $noteQuery[0]);
    }

    $: if (!event && note) {
        event = new NDKEvent($ndk, JSON.parse(note.event));
    }
</script>

{#if !_note}
    Loading {noteId}
{:else}
    <div class="
        border border-zinc-800 rounded-lg
        bg-zinc-900
    ">
        <div class="flex flex-col items-center">
            <div class="flex flex-row gap-4 w-full px-4 pt-4 items-center">
                <Avatar pubkey={_note.pubkey} klass="h-8" />

                <div class="text-normal text-zinc-400 font-normal">
                    <Name pubkey={_note.pubkey} />
                </div>
            </div>

            <div class="text-normal text-zinc-300 p-4 w-full flex-grow">
                <FormattedContent
                    note={_note.content}
                    tags={_note.tags}
                />
            </div>

            <div class="
                flex flex-row
                items-center
                justify-between
                w-full
                rounded-b-lg
                p-4 pt-0
            ">
                <div class="flex flex-row gap-4 items-center">
                    {#if $replies && $replies.length > 0}
                        <button class="text-sm text-gray-500"
                        >
                            {$replies.length} comments
                        </button>
                    {/if}
                </div>

                <div class="flex flex-row gap-4 items-center">
                    <!-- <button class="text-slate-500 hover:text-purple-700">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                    </button> -->
                    <button
                        class="text-slate-500 hover:text-purple-700"
                        on:click={() => { console.log('change', showComment); showComment = !showComment }}
                    >
                        <CommentIcon />
                    </button>
                </div>
            </div>

            <div class={(showComment ? `block` : 'hidden') + " w-full text-zinc-300"}>
                <Comment op={event} on:commented={() => { showComment = false }} />
            </div>
        </div>
    </div>

    <div class="ml-6 flex flex-col gap-4">
        {#each ($replies||[]) as reply}
            <svelte:self note={reply} />
        {/each}
    </div>
{/if}
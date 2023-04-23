<script lang="ts">
	import CommentIcon from '$lib/icons/Comment.svelte';
    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import { ndk } from '$lib/store';
    import { NDKEvent } from '@nostr-dev-kit/ndk';
    import {nip19} from 'nostr-tools';
    import Comment from '$lib/components/Comment.svelte';
    import Note from '$lib/components/Note.svelte';
    import NoteInterface from '$lib/interfaces/notes';
    import { onMount } from 'svelte';

    export let note: App.Note;

    let replies;

    onMount(() => {
        if (note?.id) {
            replies = NoteInterface.load({ replies: [note.id] });
        }
    });

    // extract the domain name from the url
    const event = new NDKEvent($ndk, JSON.parse(note.event));
    let showComment = false;

    function urlFor(note: App.Highlight) {
        if (note.articleId) {
            const [kind, pubkey, identifier] = note.articleId.split(':');
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
    border border-zinc-800 rounded-lg
    bg-zinc-900
    h-full
">
    <div class="flex flex-col items-center h-full">
        <div class="flex flex-row gap-4 w-full px-4 pt-4 items-center">
            <Avatar pubkey={note.pubkey} klass="h-8" />

            <div class="text-normal text-zinc-400 font-normal">
                <Name pubkey={note.pubkey} />
            </div>
        </div>

        <div class="text-normal text-zinc-300 p-4 w-full flex-grow">
            {note.content}
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

<div class="ml-6">
    {#each ($replies||[]) as reply}
        <Note note={reply} />
    {/each}
</div>

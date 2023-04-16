<script lang="ts">
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
            replies = NoteInterface.fromCacheRepliesTo(note.id);
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
        console.log(note);
    }
</script>

<div class="
    border border-gray-200 rounded-lg mb-4
    bg-white
    shadow
">
    <div class="flex flex-col items-center">
        <div class="flex flex-row gap-2 w-full px-4 pt-4 items-center">
            <Avatar userProfile={{id:note.pubkey}} klass="h-8" />

            <div class="text-normal text-slate-700 font-semibold">
                <Name userProfile={{id:note.pubkey}} />
            </div>
        </div>

        <div class="text-sm text-gray-700 p-4 w-full">
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
                <button class="text-slate-500 hover:text-purple-700">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                </button>
                <button
                    class="text-slate-500 hover:text-purple-700"
                    on:click={() => { console.log('change', showComment); showComment = !showComment }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                    </svg>
                </button>
            </div>
        </div>

        <div class={(showComment ? `block` : 'hidden') + " w-full"}>
            <Comment op={event} on:commented={() => { showComment = false }} />
        </div>
    </div>
</div>

<div class="ml-6">
    {#if $replies}
        {#each $replies as reply}
            <Note note={reply} />
        {/each}
    {/if}
</div>

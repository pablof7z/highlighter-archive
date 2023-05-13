<script lang="ts">
    import type { NDKEvent } from "@nostr-dev-kit/ndk";

    import CopyIcon from '$lib/icons/Copy.svelte';
    import CheckIcon from '$lib/icons/Check.svelte';
    import ViewIcon from '$lib/icons/View.svelte';
    import LinkIcon from '$lib/icons/Link.svelte';

    import NoteCard from '$lib/components/notes/card.svelte';

    import BookmarkButton from '$lib/components/events/buttons/bookmark.svelte';
    import ZapsButton from '$lib/components/events/buttons/zaps.svelte';
    import RepliesButton from '$lib/components/events/buttons/replies.svelte';
    import BoostButton from '$lib/components/events/buttons/boost.svelte';

    import CardContent from './content.svelte';

    import Avatar from "../Avatar.svelte";
    import Name from "../Name.svelte";
    import { Tooltip } from "flowbite-svelte";

    export let event: NDKEvent;
    export let note: App.Note | undefined = undefined;
    export let highlight: App.Highlight | undefined = undefined;

    export let skipHeader = false;
    export let skipFooter = false;
    export let skipButtons = false;
    export let userPubkey: string | undefined = undefined;
    export let byString: string | undefined = undefined;
    export let expandReplies = false;

    export let replies: App.Note[] | undefined = undefined;

    if (!userPubkey) userPubkey = event.pubkey;

    let copiedEventId = false;
    let niceTime = event.created_at ? new Date(event.created_at * 1000).toLocaleString() : undefined;
    let noteId = event.encode();

    function copyId() {
        navigator.clipboard.writeText(event.id);
        copiedEventId = true;
        setTimeout(() => {
            copiedEventId = false;
        }, 1500);
    }
</script>

<div class="flex flex-col gap-6">
    <div class="
        overflow-hidden rounded-lg bg-white shadow
        flex flex-col gap-4
        px-6 py-4
        group
        event-card
    ">
        {#if !skipHeader}
            <!-- Header -->
            <div class="flex flex-row justify-between items-start relative">
                <div class="flex flex-col gap-2">
                    <div class="flex flex-row gap-4 items-start">
                        <Avatar pubkey={userPubkey} klass="h-8" />
                        <div class="text-lg">
                            <Name pubkey={userPubkey} />
                        </div>
                    </div>
                </div>

                <div class="
                    flex flex-col gap-4 absolute -right-14
                    opacity-0 group-hover:opacity-100 transition duration-300
                ">
                    <button class="text-gray-700 hover:text-gray-400 transition duration-300 w-fit"
                        on:click={() => {
                            navigator.clipboard.writeText(JSON.stringify(event.rawEvent()));
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

        <slot />

        {#if !$$slots.default}
            <div class="
                leading-relaxed h-full flex flex-col
                py-2
                overflow-auto
            ">
                <CardContent
                    note={event.content}
                    tags={event.tags}
                />
            </div>
        {/if}

        {#if !skipFooter}
            <!-- Footer -->
            <div class="
                flex flex-row
                items-center
                justify-between
                w-full
                rounded-b-lg
                pb-0
                relative
            ">
                <div class="flex flex-row gap-4 items-center whitespace-nowrap">
                    <a
                        href="/p/{userPubkey}"
                        class="flex flex-row gap-4 items-center justify-center">
                        <Avatar pubkey={userPubkey} klass="h-4" />
                        <div class=" text-gray-500 text-xs hidden sm:block">
                            {byString||''}
                            <Name pubkey={userPubkey} />
                        </div>
                    </a>
                </div>

                <div class="
                    absolute bottom-0 right-0
                    opacity-100
                    {!skipButtons ? 'group-hover:opacity-0' : ''}
                    transition duration-300
                    text-xs text-slate-500
                    z-0
                ">
                    {niceTime}
                </div>

                {#if !skipButtons}
                    <div class="
                        flex flex-row gap-4 items-center
                        opacity-0 group-hover:opacity-100
                        transition duration-300
                        z-10
                    ">
                        <BookmarkButton {event} />

                        <ZapsButton {highlight} />

                        <BoostButton {note} {highlight} {event} />

                        {#if replies}
                            <RepliesButton {highlight} {note} {event} {replies} />
                        {/if}

                        <!-- {#if !highlight.articleId && highlight.url && !skipUrl}
                            <a href={highlight.url} class="text-gray-500 hover:text-orange-500 flex flex-row gap-3 text-sm items-center">
                                {domain}
                            </a>
                            <Tooltip  color="black">
                                {highlight.url}
                            </Tooltip>
                        {/if} -->

                        <a href={`/e/${noteId}`} class="
                            text-slate-500 hover:text-orange-500
                            flex flex-row items-center gap-2
                        ">
                            <LinkIcon />
                        </a>
                        <Tooltip color="black">Link to this note</Tooltip>
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    {#if expandReplies}
        <div class="ml-6">
            {#each replies as reply}
                <NoteCard note={reply} />
            {/each}
        </div>
    {/if}
</div>
<script lang="ts">
    import Zaps from "../../../routes/atlas/components/notes/buttons/zaps.svelte";
    import Name from "../Name.svelte";
    import Avatar from "../Avatar.svelte";

    import BookmarkIcon from '$lib/icons/Bookmark.svelte';
    import CommentIcon from '$lib/icons/Comment.svelte';
    import LinkIcon from '$lib/icons/Link.svelte';

    import HighlightContent from "./content.svelte";

    import { Tooltip } from "flowbite-svelte";
    import { openModal } from 'svelte-modals'
    import BookmarkModal from '$lib/modals/Bookmark.svelte';
    import { ndk } from "$lib/store";
    import { NDKEvent, NDKUser } from "@nostr-dev-kit/ndk";
    import NoteInterface from "$lib/interfaces/notes";

    export let highlight: App.Highlight;
    export let skipHighlighter = false;

    let highlightEvent = new NDKEvent($ndk, JSON.parse(highlight.event));
    let replies: any;
    let npub = (new NDKUser({hexpubkey: highlight.pubkey})).npub;

    $: if (highlight?.id && !replies) {
        replies = NoteInterface.load({ replies: [highlight.id] });
    }
</script>

<li class="px-4 py-4 sm:px-0 group relative">
    <div class="flex flex-col gap-4">
        <div>
            <HighlightContent {highlight} />
        </div>

        <div class="
            flex flex-row items-center justify-between
            {!skipHighlighter ? '' : "absolute bottom-0 right-0" }
        ">
            {#if !skipHighlighter}
                <div class="text-sm font-medium text-zinc-600 flex flex-row items-center gap-2">
                    <Avatar pubkey={highlight.pubkey} klass="w-4 h-4" />
                    by
                    <a href="/p/{npub}">
                        <Name pubkey={highlight.pubkey} />
                    </a>
                </div>
            {/if}

            <div class="
                flex flex-row items-center gap-4
                duration-200
                opacity-0 group-hover:opacity-100
                {!skipHighlighter ? '' : "bg-white px-4 py-2 rounded-lg shadow-md" }
            ">
                <button
                    class="text-slate-500 hover:text-purple-700"
                    on:click={() => { openModal(BookmarkModal, { event: highlightEvent }) }}
                ><BookmarkIcon /></button>
                <Tooltip  color="black">Bookmark</Tooltip>

                <button class="
                    text-slate-500 hover:text-orange-500
                    flex flex-row items-center gap-2
                ">
                    <CommentIcon />
                    {($replies||[]).length}
                </button>
                <Tooltip  color="black">Discuss</Tooltip>

                <Zaps {highlight} />

                <a href={`/e/${highlightEvent.encode()}`} class="
                    text-slate-500 hover:text-orange-500
                    flex flex-row items-center gap-2
                ">
                    <LinkIcon />
                </a>
                <Tooltip  color="black">Link to this highlight</Tooltip>
            </div>
        </div>
    </div>
</li>
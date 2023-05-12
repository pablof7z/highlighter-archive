<script lang="ts">
    import CloseIcon from '$lib/icons/Close.svelte';
    import ndk from '$lib/stores/ndk';
    import ClickToAddComment from '$lib/components/ClickToAddComment.svelte';
    import { NDKEvent } from '@nostr-dev-kit/ndk';
    import { closeModal } from 'svelte-modals';
    import { fade } from 'svelte/transition';
    import HighlightListItem from '$lib/components/HighlightListItem.svelte';
    import RoundedButton from '../../routes/(main)/components/RoundedButton.svelte';

    export let event: NDKEvent;
    export let highlight: App.Highlight;
    export let article: App.Article;

    let comment: string;

    async function save() {
        if (comment && comment.length > 0) {
            const commentEvent = new NDKEvent($ndk, {
                kind: 1,
                content: `${comment}\nnostr:${event.encode()}`,
                tags: [
                    ['q', event.tagId(), 'quote']
                ]
            } as NostrEvent)
            await commentEvent.publish();
        }
    }
</script>

<div role="dialog" class="modal" transition:fade>
    <div class="
        max-w-prose
        rounded-xl p-6
        shadow-xl shadow-black
        bg-zinc-50
        flex flex-col gap-8
        relative
    " style="pointer-events: auto;">
        <button class="
            text-zinc-500 hover:text-zinc-300 transition duration-300
            absolute top-2 right-2
        " on:click={closeModal}>
            <CloseIcon />
        </button>

        <div class="flex flex-col gap-8">
            <h2 class="text-zinc-500 font-semibold text-base uppercase">REPOST</h2>

            <div class="flex flex-col gap-2">
                <ClickToAddComment bind:value={comment} />

                <HighlightListItem
                    {highlight}
                    {article}
                    skipTitle={true}
                />
            </div>

            <div class="flex flex-row justify-between">
                <div class="text-xs text-zinc-500">
                </div>

                <RoundedButton on:click={save}>
                    Publish
                </RoundedButton>
            </div>
        </div>
    </div>
</div>

<style>
    .modal {
        position: fixed;
        top: 0;
        bottom: 0;
        right: 0;
        left: 0;
        display: flex;
        justify-content: center;
        align-items: center;

        /* allow click-through to backdrop */
        pointer-events: none;
    }

    .actions {
        margin-top: 32px;
        display: flex;
        justify-content: flex-end;
    }
</style>
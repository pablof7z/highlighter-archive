<script lang="ts">
    import { ndk } from '$lib/store';
    import BookmarkListInterface from '$lib/interfaces/bookmark-list';
    import UserCard from '$lib/components/UserCard.svelte';
    import PillButton from '$lib/components/buttons/pill.svelte';
    import CloseIcon from '$lib/icons/Close.svelte';
    import { NDKEvent, zapInvoiceFromEvent } from '@nostr-dev-kit/ndk';
    import { requestProvider } from 'webln';

    import { closeModal } from 'svelte-modals';
    import { fade } from 'svelte/transition';
    import { onMount } from 'svelte';
    import type { NostrEvent } from '@nostr-dev-kit/ndk/lib/src/events';
    import { goto } from '$app/navigation';

    let currentNpub;
    let bookmarkLists, _bookmarkLists: App.BookmarkList[] = [];
    let name: string;
    let description: string;

    async function loadbookmarkLists() {
        const user = await $ndk.signer?.user();

		if (!user) {
            setTimeout(() => {
                loadbookmarkLists();
            }, 100);
            return;
		}

		currentNpub = user.npub;

		const opts = { pubkeys: [user.hexpubkey()] };
		bookmarkLists = BookmarkListInterface.load(opts);
		return BookmarkListInterface.startStream(opts);
    }

    async function createNewList() {
        const user = await $ndk.signer?.user();

        if (!user) {
            return;
        }

        const newListEvent = new NDKEvent($ndk, {
            kind: 30000,
            tags: [
                ['d', name ],
            ],
        } as NostrEvent);
        if (description) {
            newListEvent.tags.push(['d', description]);
        }
        await newListEvent.publish();
        goto(`/atlas/bookmarks/${newListEvent.encode()}`);
        closeModal();
    }
</script>

<div role="dialog" class="modal" transition:fade>
    <div class="
        rounded-xl p-6
        shadow-xl
        max-w-sm
        w-full
        bg-zinc-900 text-white
        flex flex-col gap-4
        relative
    " style="pointer-events: auto;">
        <button class="
            text-zinc-500 hover:text-zinc-300 transition duration-300
            absolute top-2 right-2
        " on:click={closeModal}>
            <CloseIcon />
        </button>
        <div class="flex flex-col gap-8">
            <h2 class="text-zinc-500 font-semibold text-base uppercase">NEW LIST</h2>

            <div class="flex flex-col">
                <input type="text" class="
                    rounded-t-lg
                    w-full
                    border-zinc-800
                    dark:bg-zinc-800 dark:border-zinc-600
                    border-b-zinc-900
                    bg-zinc-800
                    text-zinc-300
                    text-xl
                " placeholder="Name" bind:value={name} autofocus />
                <textarea class="
                    rounded-b-lg
                    w-full text-xl
                    border-zinc-800
                    dark:bg-zinc-800 dark:border-zinc-600
                    bg-zinc-800
                    text-zinc-300
                " placeholder="Description" bind:value={description} />
            </div>

            <div class="actions">
                <button class="
                    bg-purple-600 hover:bg-orange-500
                    transition duration-300 ease-in-out
                    text-base py-2 font-bold rounded-xl w-full
                " on:click={createNewList}>
                    CREATE
                </button>
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
</style>
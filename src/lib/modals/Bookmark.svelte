<script lang="ts">
    import { ndk } from '$lib/store';
    import BookmarkListInterface from '$lib/interfaces/bookmark-list';
    import CloseIcon from '$lib/icons/Close.svelte';
    import { NDKEvent } from '@nostr-dev-kit/ndk';

    import { closeModal } from 'svelte-modals';
    import { fade } from 'svelte/transition';
    import { onMount } from 'svelte';
    import type { NostrEvent } from '@nostr-dev-kit/ndk/lib/src/events';

    export let event: NDKEvent;

    let currentNpub;
    let bookmarkLists, _bookmarkLists: App.BookmarkList[] = [];
    let newListName: string;

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

    onMount(async () => {
        loadbookmarkLists();
    })

    $: {
		_bookmarkLists = (($bookmarkLists || []) as App.BookmarkList[]).sort((a, b) => {
			return b.createdAt - a.createdAt;
		});

		_bookmarkLists = _bookmarkLists;
	}

    async function addToBookmarkList(list: App.BookmarkList) {
        const event = new NDKEvent($ndk, JSON.parse(list.event));

        // check if event is already in list
        const [a,b] = event.tagReference();
        if (event.tags.find((tag) => tag[0] === a && tag[1] === b)) {
            event.tags.filter((tag) => tag[0] !== a && tag[1] !== b);
            await event.publish();
            closeModal();
            return;
        }

        event.tags.push(event.tagReference());
        await event.publish();
        closeModal();
    }

    async function createNewList() {
        const user = await $ndk.signer?.user();

        if (!user) {
            return;
        }

        console.log(event);

        const newListEvent = new NDKEvent($ndk, {
            kind: 30001,
            tags: [
                ['d', newListName ],
                event.tagReference(),
            ],
        } as NostrEvent);
        await newListEvent.publish();
        closeModal();

        newListName = '';
    }
</script>

<div role="dialog" class="modal" transition:fade>
    <div class="
        rounded-xl p-6
        shadow-xl shadow-black
        bg-zinc-900 text-white
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
            <h2 class="text-zinc-500 font-semibold text-base uppercase">BOOKMARK</h2>

            <ul class="
                rounded-lg border border-zinc-800
                dark:bg-zinc-800 dark:border-zinc-600
                divide-y divide-zinc-800 text-zinc-300 dark:divide-zinc-600
                max-h-56 overflow-y-auto
                w-full max-w-sm
            ">
                {#each _bookmarkLists as bookmarkList}
                    <li>
                        <button class="p-3 truncate" on:click={()=>{addToBookmarkList(bookmarkList)}}>{bookmarkList.title}</button>
                    </li>
                {/each}
            </ul>

            <div class="flex flex-row gap-2">
                <input type="text" class="
                    rounded-lg
                    w-full
                    border-zinc-800
                    dark:bg-zinc-800 dark:border-zinc-600
                    bg-transparent
                    text-zinc-300
                " placeholder="New List" bind:value={newListName} />

                <button class="
                    text-sm bg-slate-800 px-4 rounded-lg
                " on:click={createNewList}>
                    Create
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

    .actions {
        margin-top: 32px;
        display: flex;
        justify-content: flex-end;
    }
</style>
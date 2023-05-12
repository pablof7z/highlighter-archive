<script lang="ts">
    import ndk from "$lib/stores/ndk";
    import BookmarkListInterface from '$lib/interfaces/bookmark-list';

    import NewIcon from '$lib/icons/New.svelte';

    import { Button, Dropdown, DropdownItem, Chevron } from 'flowbite-svelte'
    import ToolbarButton from '../components/toolbar/button.svelte';
    import BookmarkList from '../components/bookmark-list/Card.svelte';

    import NewListModal from '$lib/modals/lists/New.svelte'

    import { openModal } from 'svelte-modals'

    import { onMount } from 'svelte';

    let bookmarkLists, _bookmarkLists: App.BookmarkList[] = [];

    async function loadbookmarkLists() {
        const user = await $ndk.signer?.user();

		if (!user) {
            setTimeout(() => {
                loadbookmarkLists();
            }, 100);
            return;
		}

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

    let openMenu = false;
</script>

<div class="flex flex-col gap-8">
    <div class="flex flex-row justify-end relative">
        <ToolbarButton on:click={() => {openMenu = !openMenu}}>
            <NewIcon />
            Create new
        </ToolbarButton>
        {#if openMenu}
            <div class=" bg-white flex font-semibold text-sm flex-col absolute rounded-xl shadow-lg mt-10 border border-zinc-400">
                <a href="/atlas/lists/people/new" class="
                    text-zinc-500 hover:text-white
                    bg-whitse hover:bg-orange-600
                    px-4 py-2 rounded-xl
                ">Profile List</a>

                <button class="
                    text-zinc-500 hover:text-white
                    bg-whitse hover:bg-orange-600
                    px-4 py-2 rounded-xl
                " on:click={() => { openModal(NewListModal, {}) }}>Generic List</button>
            </div>
        {/if}
    </div>

    <div class="grid grid-flow-row md:grid-cols-3 xl:sdgrid-cols-3 gap-4">
        {#each _bookmarkLists as bookmarkList}
            <div>
                <BookmarkList {bookmarkList} />
            </div>
        {/each}
    </div>
</div>
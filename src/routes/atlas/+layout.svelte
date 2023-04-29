<script lang="ts">
    import GlobalIcon from '$lib/icons/Global.svelte';
    import HighlightIcon from '$lib/icons/Highlight.svelte';
    import BookmarkIcon from '$lib/icons/Bookmark.svelte';
    import NoteIcon from '$lib/icons/MyHighlights.svelte';

    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import NavigationButton from './components/navigation/Button.svelte';

    import { ndk, currentUser } from '$lib/store';

    import BookmarkListInterface from '$lib/interfaces/bookmark-list';
    import { onMount } from 'svelte';
    import ListItem from './components/navigation/list-item.svelte';
  import { NDKEvent } from '@nostr-dev-kit/ndk';

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

    function isTopLevel(_list: App.BookmarkList) {
        for (const list of _bookmarkLists) {
            // check if a list has _list's id in its tags
            const listEvent = new NDKEvent($ndk, JSON.parse(list.event));
            if (listEvent.tags.find(t => (
                t[1] === _list.id) && // if this list is referenced by another list
                t[1] !== listEvent.id // that is not itself
            )) {
                return false;
            }
        }

        return true;
    }

    $: {
		_bookmarkLists = (($bookmarkLists || []) as App.BookmarkList[]).sort((a, b) => {
			return b.createdAt - a.createdAt;
		});

		_bookmarkLists = _bookmarkLists;
	}
</script>

<div class="h-full pb-48">
    <div class="fixed inset-y-0 z-50 flex w-72 flex-col">
    <!-- Sidebar component, swap this element with another sidebar if you like -->
        <div class="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6">
            <div class="flex h-16 shrink-0 items-center flex-row gap-2 font-bold tracking-wider text-zinc-800">
                <GlobalIcon />
                <div class="flex flex-row gap-1">
                    <span class="text-zinc-900">ATLAS</span>
                    <span class="text-zinc-400 font-light">Notes</span>
                    <span class="text-orange-500 text-xs font-semibold tracking-tight">ALPHA</span>
                </div>
            </div>
            <nav class="flex flex-1 flex-col">
            <ul role="list" class="flex flex-1 flex-col gap-y-7">
                <li>
                    <ul role="list" class="-mx-2 space-y-1">
                        <li>
                            <NavigationButton route="/atlas/highlights">
                                <HighlightIcon />
                                Highlights
                            </NavigationButton>

                            <NavigationButton route="/atlas/bookmarks">
                                <BookmarkIcon />
                                Bookmarks
                            </NavigationButton>

                            <NavigationButton route="/atlas/notes">
                                <NoteIcon />
                                Private Notes
                            </NavigationButton>
                        </li>
                    </ul>
                </li>

                <li>
                    <div class="text-xs font-semibold leading-6 text-gray-400">Your lists</div>
                    <ul role="list" class="-mx-2 mt-2 space-y-1">
                        {#each _bookmarkLists as bookmarkList}
                            {#if isTopLevel(bookmarkList)}
                                <ListItem list={bookmarkList} allLists={_bookmarkLists} />
                            {/if}
                        {/each}
                    </ul>
                </li>

                <li class="-mx-6 mt-auto">
                <a href="#" class="flex items-center gap-x-4 px-6 py-3 text-sm font-semibold leading-6 text-gray-900 hover:bg-gray-50">
                    <span class="sr-only">Your profile</span>
                    {#if $currentUser}
                        <Avatar pubkey={$currentUser.hexpubkey()} klass="h-8 w-8 " />
                        <span aria-hidden="true">
                            <Name pubkey={$currentUser.hexpubkey()} />
                        </span>
                    {/if}
                </a>
                </li>
            </ul>
            </nav>
        </div>
    </div>

    <main class="py-10 pl-72 h-full pb-48">
        <div class="px-4 sm:px-6 lg:px-8 h-full">
            <div class="flex flex-col gap-6 max-h-screen">
                <!-- <label for="default-search" class="mb-2 text-sm font-medium text-gray-900 sr-only dark:text-white">Search</label>
                <div class="relative">
                    <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg aria-hidden="true" class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                    <input type="search" id="default-search" class="
                        block w-full p-4 pl-10 text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-orange-500 dark:focus:border-orange-500
                        focus:bg-white
                    " placeholder="Search... (not yet)" required disabled>
                    <button type="submit" class="text-white absolute right-2.5 bottom-2.5 bg-orange-600 hover:bg-orange-800 focus:ring-4 focus:outline-none focus:ring-orange-300 font-medium rounded-lg text-sm px-4 py-2 dark:bg-orange-600 dark:hover:bg-orange-600 dark:focus:ring-orange-800">Search</button>
                </div> -->

                <!-- <div class="flex-grow pb-24"> -->
                    <slot />
                <!-- </div> -->

            </div>
        </div>
    </main>
</div>

<style>
    :global(html) {
        background-color: #f7f7f7 !important;
    }

    :global(body) {
        background-color: #f7f7f7 !important;
    }
</style>
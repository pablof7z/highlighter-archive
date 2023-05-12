<script lang="ts">
    import UserCard from '../../../components/users/Card.svelte';
    import ndk from '$lib/stores/ndk';
    import { NDKEvent, type NDKUser } from '@nostr-dev-kit/ndk';
    import type { NostrEvent } from '@nostr-dev-kit/ndk/lib/src/events';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    // import UserInterface from '$lib/interfaces/user';

    // import NewIcon from '$lib/icons/New.svelte';

    // import ToolbarButton from '../components/toolbar/button.svelte';
    // import BookmarkList from '../components/bookmark-list/Card.svelte';

    // import { onMount } from 'svelte';

    let currentNpub;
    let userList, _userList: App.BookmarkList[] = [];
    let followsList: Promise<Set<NDKUser>>;

    async function loadFollowList() {
        const user = await $ndk.signer?.user();

        if (!user) {
            console.log('no user');

            setTimeout(() => {
                loadFollowList();
            }, 100);
            return;
		}

        user.ndk = $ndk;
        followsList = user.follows();
    }

    onMount(async () => {
        loadFollowList();
    });


    // async function loadUserList() {
    //     const user = await $ndk.signer?.user();

	// 	if (!user) {
    //         setTimeout(() => {
    //             loadUserList();
    //         }, 100);
    //         return;
	// 	}

	// 	currentNpub = user.npub;

	// 	const opts = { pubkeys: [user.hexpubkey()] };
	// 	userList = UserInterface
	// 	return BookmarkListInterface.startStream(opts);
    // }

    // onMount(async () => {
    //     loadUserList();
    // })

    // $: {
	// 	_userList = (($userList || []) as App.BookmarkList[]).sort((a, b) => {
	// 		return b.createdAt - a.createdAt;
	// 	});

	// 	_userList = _userList;
	// }

    let currentSelection = new Set<NDKUser>();

    function toggleUser(user: NDKUser) {
        if (currentSelection.has(user)) {
            currentSelection.delete(user);
        } else {
            currentSelection.add(user);
        }

        currentSelection = currentSelection;
    }

    let listName: string = '';
    let listDescription: string = '';

    async function createList() {
        const tags = Array.from(currentSelection).map((user) => {
            return ['p', user.hexpubkey()];
        });
        tags.push(['client', 'atlas']);
        tags.push(['name', listName]);
        tags.push(['d', listName]);
        const event = new NDKEvent($ndk, {
            kind: 30001,
            tags,
            content: listDescription,
        } as NostrEvent);
        await event.publish();
        goto(`/atlas/lists/${event.encode()}`);
    }
</script>

<div class="isolate -space-y-px rounded-md shadow-sm bg-white">
    <div class="relative rounded-md rounded-b-none px-3 pb-1.5 pt-2.5 ring-1 ring-inset ring-gray-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-orange-500">
        <label for="name" class="block text-xs font-medium text-gray-900">List Name</label>
        <input type="text" name="name" bind:value={listName} id="name" class="block w-full border-0 p-0 text-gray-900 placeholder:text-gray-400 lg:text-xl focus:ring-0 sm:text-sm sm:leading-6" placeholder="List name">
    </div>
    <div class="relative rounded-md rounded-t-none px-3 pb-1.5 pt-2.5 ring-1 ring-inset ring-gray-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-orange-500">
      <label for="job-title" class="block text-xs font-medium text-gray-900">Description</label>
      <input type="text" name="job-title" bind:value={listDescription} id="job-title" class="block w-full border-0 p-0 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-xl sm:leading-6" placeholder="List description">
    </div>
  </div>

<button type="submit" class="text-white bg-orange-600 hover:bg-orange-800 focus:ring-4 focus:outline-none focus:ring-orange-300 font-medium rounded-lg text-sm px-4 py-2 dark:bg-orange-600 dark:hover:bg-orange-600 dark:focus:ring-orange-800" on:click={createList}>Create List</button>

{#if followsList}
    {#await followsList}
        <div>Loading...</div>
    {:then followsList}
        <div class="grid grid-cols-4 gap-4">
            {#each Array.from(followsList.values()) as user}
                <div class="flex flex-col items-center gap-4">
                    <UserCard pubkey={user.hexpubkey()}>
                        <button type="submit" class="
                            text-zinc-400 hover:text-zinc-600
                            hover:bg-zinc-100
                            border-2 border-zinc-200 hover:border-zinc-300
                            self-end
                            font-semibold rounded-lg text-sm
                            px-4 py-2
                        " on:click={() => toggleUser(user)}>
                            {#if currentSelection.has(user)}
                                Remove
                            {:else}
                                Add
                            {/if}
                        </button>
                    </UserCard>
                </div>
            {/each}
        </div>
    {/await}
{/if}
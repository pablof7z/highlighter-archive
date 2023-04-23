<script lang="ts">
	import NewIcon from '$lib/icons/New.svelte';
    import { ndk } from '$lib/store';
    import BookmarkListInterface from '$lib/interfaces/bookmark-list';
    import Highlight from '../../components/highlights/Card.svelte';
    import Note from '../../components/notes/Card.svelte';
    import PageTitle from '../../components/PageTitle.svelte';

    import { onDestroy, onMount } from 'svelte';
    import { page } from '$app/stores';
    import { NDKEvent, NDKSubscription } from '@nostr-dev-kit/ndk';
    import type { NDKTag } from '@nostr-dev-kit/ndk/lib/src/events';
    import NoteInterface from '$lib/interfaces/notes';
    import HighlightInterface from '$lib/interfaces/highlights';
    import UserCard from '$lib/components/UserCard.svelte';

    const { naddr } = $page.params;
    let prevNaddr: string;

    let currentNpub;
    let bookmarkLists, bookmarkList: App.BookmarkList;
    let tags: NDKTag[] = [];
    let noteQuery, highlightQuery;
    let peopleIds: string[] = [];
    let taggedNotes: App.Note[] = [];
    let taggedNoteIds = new Set();
    let taggedHighlights: App.Highlight[] = [];
    let taggedHighlightIds = new Set();

    let activeSubs: NDKSubscription[] = [];

    async function loadbookmarkLists() {
        const user = await $ndk.signer?.user();

		if (!user) {
            setTimeout(() => {
                loadbookmarkLists();
            }, 100);
            return;
		}

		currentNpub = user.npub;

		const opts = { naddr };

        if (naddr) {
            bookmarkLists = BookmarkListInterface.load(opts);
            activeSubs = BookmarkListInterface.startStream(opts);
        }
    }

    onDestroy(() => {
        for (const sub of activeSubs) {
            sub.stop();
        }
    });

    let listEvent: NDKEvent;

    $: {
        if (naddr !== prevNaddr) {
            prevNaddr = naddr;
            loadbookmarkLists();
        }

        const peopleIdCount = peopleIds.length;

        if ($bookmarkLists && $bookmarkLists[0] && !bookmarkList) {
            bookmarkList = $bookmarkLists[0];
            console.log('bookmarkList', bookmarkList);

            listEvent = new NDKEvent($ndk, JSON.parse(bookmarkList.event));
            tags = listEvent.tags;
            const noteIds: string[] = [];

            for (const tag of tags) {
                switch (tag[0]) {
                    case 'e':
                        noteIds.push(tag[1]);
                        break;
                    case 'p':
                        peopleIds.push(tag[1]);
                        break;
                }
            }

            if (noteIds.length > 0) {
                noteQuery = NoteInterface.load({ ids: noteIds });
                highlightQuery = HighlightInterface.load({ ids: noteIds });
                HighlightInterface.startStream({ ids: noteIds });
            }
        }

        // if new people
        if (peopleIds.length > peopleIdCount) {
            peopleIds = peopleIds;

            peopleFeed = NoteInterface.load({ pubkeys: peopleIds, limit: 10 });
        }

        let changes = false;

        if ($noteQuery) {
            for (const note of $noteQuery) {
                if (!taggedNoteIds.has(note.id)) {
                    changes = true;
                    taggedNotes.push(note);
                    taggedNoteIds.add(note.id);
                }
            }
        }

        if ($highlightQuery) {
            for (const higlight of $highlightQuery) {
                if (!taggedHighlightIds.has(higlight.id)) {
                    changes = true;
                    taggedHighlights.push(higlight);
                    taggedHighlightIds.add(higlight.id);
                }
            }
        }

        if (changes) {
            taggedNotes = taggedNotes;
            taggedNoteIds = taggedNoteIds;
            taggedHighlights = taggedHighlights;
            taggedHighlightIds = taggedHighlightIds;
        }
	}

    let showAdd = false;
    let addId: string | undefined;

    function addClicked() {
        if (!showAdd) {
            showAdd = true;
            return;
        }

        if (!addId || addId.length === 0) {
            showAdd = false;
            return;
        }
    }

    let peopleFeed;
</script>

{naddr}

<div class="flex flex-col gap-8">

    <!-- Header -->
    <PageTitle title={bookmarkList?.title} subtitle={bookmarkList?.description}>
        <div class="ml-4 mt-2 flex-grow flex flex-row gap-4">
            {#if showAdd}
                <input type="text" class="
                    shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md
                " placeholder="npub..., naddr..., a URL, anything" bind:value={addId} />
            {:else}
                <div class="flex-grow"></div>
            {/if}

            <button type="button" class="
                flex flex-row gap-2
                items-center rounded-md bg-orange-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500
            " on:click={addClicked}>
                <NewIcon />
                Add
            </button>
        </div>
    </PageTitle>

    <div class="grid grid-flow-row md:grid-cols-2 lg:sdgrid-cols-3 gap-4">
        {#each taggedNotes as tag}
            <div class="h-full">
                <Note note={tag} />
            </div>
        {/each}
        {#each taggedHighlights as tag}
            <div class="h-full">
                <Highlight highlight={tag} />
            </div>
        {/each}
        {#each peopleIds as personId}
            <div class="h-full">
                <UserCard pubkey={personId} />
            </div>
        {/each}
    </div>

    {#if peopleIds.length > 0}
        List feed

        <div class="max-w-lg flex flex-col gap-4">
            {#if $peopleFeed}
                {#each ($peopleFeed||[]) as note}
                    <Note note={note} />
                {/each}
            {:else}
                Loading...
            {/if}
        </div>
    {/if}
</div>
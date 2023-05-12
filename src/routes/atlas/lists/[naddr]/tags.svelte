<script lang="ts">
    import type { NDKTag } from '@nostr-dev-kit/ndk/lib/src/events';
    import { currentUser, ndk } from '$lib/store';
    import type { Observable } from 'dexie';
    import type { NDKSubscription } from '@nostr-dev-kit/ndk';

    import NoteInterface from '$lib/interfaces/notes';
    import HighlightInterface from '$lib/interfaces/highlights';

    import Highlight from '../../components/highlights/Card.svelte';
    import Note from '../../components/notes/Card.svelte';
    import UserCard from '$lib/components/UserCard.svelte';

    export let kind = 1;
    export let tags: NDKTag[];
    export let currentUserPubkeys: string[] = [];
    let noteIds: string[];
    let peopleIds: string[];
    let urlTags: string[];

    let prevRawTagList: NDKTag[] = [];

    let noteQuery: Observable<App.Note[]> | undefined;
    let highlightQuery: Observable<App.Highlight[]> | undefined;
    let peopleFeed: Observable<App.Note[]> | undefined;

    let taggedNotes: App.Note[] = [];
    let taggedNoteIds = new Set();
    let taggedHighlights: App.Highlight[] = [];
    let taggedHighlightIds = new Set();

    let highlightSub: NDKSubscription[] | undefined;

    $: if ($currentUser && !currentUserPubkeys.includes($currentUser.hexpubkey())) {
        currentUserPubkeys.push($currentUser.hexpubkey());
    }

    $: {
        if (prevRawTagList !== tags) {
            prevRawTagList = tags;

            noteIds = [];
            peopleIds = [];
            urlTags = [];

            for (const tag of tags) {
                switch (tag[0]) {
                    case 'a':
                        const [kind] = tag[1].split(':');
                        break;
                    case 'e':
                        noteIds.push(tag[1]);
                        break;
                    case 'p':
                        peopleIds.push(tag[1]);
                        break;
                    case 'r':
                        urlTags.push(tag[1]);
                        break;
                }
            }

            noteQuery = undefined;
            highlightQuery = undefined;
            peopleFeed = undefined;

            if (noteIds.length > 0) {
                noteQuery = NoteInterface.load({ ids: noteIds, kind });
                highlightQuery = HighlightInterface.load({ ids: noteIds });
                highlightSub = HighlightInterface.startStream({ ids: noteIds, kind });
            }

            // new people to load
            if (peopleIds.length > 0) {
                peopleFeed = NoteInterface.load({ pubkeys: peopleIds, limit: 10 });
            }
        }
    }

    $: {
        let changes = false;

        if ($noteQuery) {
            for (const note of $noteQuery) {
                if (!taggedNoteIds.has(note.id)) {
                    changes = true;
                    // sort by date
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
</script>

{#each urlTags as tag}
    <div class="h-full">
        <div
            class="flex flex-col h-full"
        >
            <div class="
                shadow
                flex flex-col h-full gap-4
                border border-zinc-200 hover:border-zinc-200
                px-6 pt-6 pb-4 rounded-xl
                bg-white hover:bg-slate-50 transition duration-200 ease-in-out
            " style="max-height: 40rem;">
                {tag}
            </div>
        </div>
    </div>
{/each}

{#each taggedNotes as tag}
    <div class="h-full">
        <Note
            note={tag}
            skipHeader={true}
            skipFooter={true}
            compact={true}
        />
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
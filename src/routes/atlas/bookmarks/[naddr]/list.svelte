<script lang="ts">
	import NewIcon from '$lib/icons/New.svelte';

    import { currentUser, ndk } from '$lib/store';
    import BookmarkListInterface from '$lib/interfaces/bookmark-list';

    import NoteVisibility from '../../components/note/visibility.svelte';
    import PageTitle from '../../components/PageTitle.svelte';
    import NoteEditor from '../../components/note-editor.svelte';
    import Tags from './tags.svelte';
    import { onDestroy, onMount } from 'svelte';
    import { NDKEvent, NDKSubscription } from '@nostr-dev-kit/ndk';
    import type { NDKTag } from '@nostr-dev-kit/ndk/lib/src/events';
    import { nip19 } from 'nostr-tools';

    export let naddr: string;
    let prevNaddr: string;

    let currentNpub;
    let bookmarkLists, bookmarkList: App.BookmarkList | null = null;
    let tags: NDKTag[] = [];
    let encryptedTags: NDKTag[] = [];

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

    function removeSubscription() {
        for (const sub of activeSubs) {
            sub.stop();
        }
    }

    onDestroy(() => {
        removeSubscription();
    });

    let listEvent: NDKEvent;

    $: {
        // reset
        if (naddr !== prevNaddr) {
            prevNaddr = naddr;
            encryptedTags = [];
            tags = [];
            bookmarkList = null;
            removeSubscription();
            loadbookmarkLists();
        } else {
            if ($bookmarkLists && $bookmarkLists[0] && bookmarkList?.createdAt !== $bookmarkLists[0].createdAt) {
                bookmarkList = $bookmarkLists[0];

                listEvent = new NDKEvent($ndk, JSON.parse(bookmarkList.event));
                decryptTags();
                tags = listEvent.tags;
            }
        }
	}

    async function decryptTags() {
        try {
            await listEvent.decrypt($currentUser!);
            const a = JSON.parse(listEvent.content);
            if (a && a[0]) {
                encryptedTags = a;
            }
        } catch (e) {
            console.error(e);
        }
    }

    let showAdd = false;

    async function save() {
        if (!addNewItemValue || addNewItemValue.length === 0) {
            console.log('here');

            return;
        }

        let tag: NDKTag = [];

        if (addNewItemValue.startsWith('http')) {
            tag = ['r', addNewItemValue];
        } else {
            const decode = nip19.decode(addNewItemValue);
            switch (decode.type) {
                case 'note':
                    tag = ['e', decode.data as string];
                    break;
                case 'naddr':
                    const { kind, pubkey, identifier } = decode.data;
                    tag = ['a', `${kind}:${pubkey}:${identifier}`];
                    break;
                case 'nprofile':
                    tag = ['p', decode.data.pubkey as string];
                    break;
                case 'npub':
                    tag = ['p', decode.data as string];
                    break;
                case 'nevent':
                    tag = ['e', decode.data.id as string];
                    break;
                default:
                    alert("not sure how to interpret that");
                    return;
            }
        }

        console.log(tag);


        listEvent.tags.push(tag);
        await listEvent.sign();
        await listEvent.publish();
        addNewItemValue = '';
    }

    let newItemType: string | undefined;
    let addNewItemValue = '';
    let newItemVisibility = 'Secret';

    function onNewItemChange() {
        const patterns: string[] = ['npub1', 'naddr', 'note1', 'nprofile', 'nevent', 'http'];
        let isNotMatching = true;

        for (const pattern of patterns) {
            if (addNewItemValue.startsWith(pattern.slice(0, addNewItemValue.length))) {
                isNotMatching = false;
                break;
            }
        }

        if (addNewItemValue.match(/ /) || isNotMatching) {
            newItemType = 'note'
        } else {
            newItemType = undefined;
        }
    }

    async function onNoteEditorSaved(e: CustomEvent) {
        const event = e.detail as NDKEvent;
        const tag = event.tagReference();

        // if the current list has a content, decrypt it
        if (listEvent?.content) {
            let tags;

            try {
                tags = JSON.parse(listEvent.content);
            } catch (e) {
                console.error('trying to parse list content as JSON', e);
                return;
            }

            if (!tags || !tags) tags = [];

            tags.push(tag);

            listEvent.content = JSON.stringify(tags);
        } else {
            listEvent.content = JSON.stringify([tag]);
        }

        await listEvent.encrypt($currentUser!);
        await listEvent.sign();
        await listEvent.publish();

        newItemType = undefined;
        addNewItemValue = '';
    }
</script>

{#if listEvent}
    <div class="flex flex-col gap-8">
        <!-- Header -->
        <PageTitle title={bookmarkList?.title} subtitle={bookmarkList?.description}>
        </PageTitle>

        <div class="grid grid-flow-row md:grid-cols-1 max-w-prose lg:sdgrid-cols-3 gap-4">
            <div class="relative flex flex-row items-center justify-center mb-8">
                {#if newItemType === 'note'}
                    <div class="pb-4 w-full">
                        <NoteEditor expandEditor={true} bind:title={addNewItemValue} on:keyup={onNewItemChange} on:saved={onNoteEditorSaved} bind:visibility={newItemVisibility} />
                    </div>
                {:else}
                    <div class="
                        px-4 py-2 text-lg
                        h-14
                        mb-12
                        shadow
                        w-full
                        border border-zinc-200
                        rounded-xl
                        bg-white transition duration-200 ease-in-out
                        flex flex-row gap-2
                    ">
                        <input autofocus bind:value={addNewItemValue} on:keyup={onNewItemChange} class="
                            w-full
                            focus:outline-none
                        " placeholder="Start typing" />

                        <div class="flex flex-row gap-2">
                            <NoteVisibility bind:visibility={newItemVisibility} />
                            <button
                                class="inline-flex items-center gap-x-2 rounded-md bg-gradient-to-br from-orange-500 to-red-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-orange-600 hover:to-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500
                                px-4
                            " on:click={save}>
                                Save
                            </button>
                        </div>
                    </div>
                {/if}
            </div>

            {#if encryptedTags}
                <Tags tags={encryptedTags} kind={4} />
            {/if}

            <Tags tags={tags} />

        </div>
    </div>
{/if}
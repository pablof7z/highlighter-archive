<script lang="ts">
    import { currentUser, backgroundBanner } from '$lib/store';
    import { onMount } from 'svelte';
    import type { Observable } from "dexie";
    import type { NDKSubscription } from '@nostr-dev-kit/ndk';
    import HighlightInterface from '$lib/interfaces/highlights';
    import ArticleCardWithHighlights from '$lib/components/articles/cards/with-highlights.svelte';

    $backgroundBanner = null;

    let followPubkeys: string[];

    let loadContactsPromise: Promise<void>;

    let subs: NDKSubscription[] = [];
    let items: Observable<App.Highlight[]>;

    async function loadArticlesGroupedByHighlightsWithinMyNetwork() {
        const myFollows = await $currentUser?.follows();
        if (!myFollows) { return; }

        const myFollowPubkeys = Array.from(myFollows).map((u) => u.hexpubkey());

        const filter = {
            pubkeys: myFollowPubkeys,
            limit: 500,
        };

        // load all my follows highlights
        items = HighlightInterface.load(filter);
		subs = HighlightInterface.startStream(filter);
    }

    onMount(() => {
        loadArticlesGroupedByHighlightsWithinMyNetwork();
    });

    let processedItemCount = 0;
    let taggedEvents: Record<string, number> = {};
    let taggedEventIds: string[] = [];

    $: if ($items?.length !== processedItemCount) {
        processedItemCount = $items?.length ?? 0;
        console.log('processedItemCount', processedItemCount);

        // go through all the items and get the tagged event
        for (const item of $items ?? []) {
            const taggedEventId = item.articleId;
            if (!taggedEventId) { console.log('item without articleId', item); continue; }

            if (!taggedEvents[taggedEventId]) {
                taggedEvents[taggedEventId] = 0;
            }

            taggedEvents[taggedEventId]++;
        }

        // sort the tagged events by count
        taggedEventIds = Object.entries(taggedEvents)
            .sort((a, b) => b[1] - a[1])
            .map((a) => a[0]);
    }

    onMount(() => {
        loadContactsPromise = loadContacts();
    })

    async function loadContacts() {
        if (!followPubkeys) {
            const followList = await $currentUser?.follows();

            if (!followList) {
                return;
            }

            followPubkeys = Array.from(followList).map((u) => u.hexpubkey());
        }
    }
</script>

<ul role="list" class="space-y-3">
    {#each taggedEventIds as articleId}
        <li class="overflow-hidden rounded-md bg-white px-6 py-4 shadow">
            <ArticleCardWithHighlights id={articleId} highlightsFrom={followPubkeys} />
        </li>
    {/each}
</ul>

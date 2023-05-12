<script lang="ts">
    import { currentUser, currentUserFollowPubkeys } from '$lib/store';
    import type { Observable } from "dexie";
    import type { NDKSubscription } from '@nostr-dev-kit/ndk';
    import HighlightInterface from '$lib/interfaces/highlights';
    import ArticleCardWithHighlights from '$lib/components/articles/cards/with-highlights.svelte';

    /**
     * Whether to skip showing the user who did the highlight
     */
    export let skipHighlighter: boolean = false;

    /**
     * Maximum number of highlights to show by default on each article card
     */
    export let maxHighlightCountToShow: number | undefined = undefined;
    export let scope: string | undefined = undefined;
    export let pubkey: string | undefined = undefined;

    let prevScope: string;
    let prevPubkey: string;

    let pubkeys: string[] | undefined = undefined;

    $: if (scope !== prevScope && scope) {
        prevScope = scope;

        switch (scope) {
            case "pubkey":
                if (!pubkey) throw new Error('pubkey is required for scope "pubkey"');
                pubkeys = [pubkey];
                break;
            case 'personal':
                pubkeys = [$currentUser?.hexpubkey()!];
                break;
            case 'network':
                pubkeys = $currentUserFollowPubkeys;
                break;
            case 'global':
                pubkeys = undefined;
                break;
        }

        loadArticlesGroupedByHighlights({pubkeys});
    }

    let subs: NDKSubscription[] = [];
    let items: Observable<App.Highlight[]>;

    async function loadArticlesGroupedByHighlights(filter: any = {}) {
        filter = {
            limit: 500,
            ...filter
        };

        items = HighlightInterface.load(filter);
		subs = HighlightInterface.startStream(filter);
    }

    let processedItemCount = 0;
    let taggedEvents: Record<string, number> = {};
    let taggedEventIds: string[] = [];

    $: if ($items?.length !== processedItemCount) {
        processedItemCount = $items?.length ?? 0;

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
</script>

<ul class="space-y-3">
    {#each taggedEventIds as articleId}
        <li class="overflow-hidden rounded-md bg-white px-6 py-4 shadow">
            <ArticleCardWithHighlights
                id={articleId}
                highlightsFrom={pubkeys}
                {maxHighlightCountToShow}
                {skipHighlighter}
            />
        </li>
    {/each}
</ul>

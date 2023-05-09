<script lang="ts">
    import { currentUser, currentUserFollowPubkeys } from '$lib/store';
    import { page } from "$app/stores";

    import Newest from './newest.svelte';
    import Highlights from './highlights.svelte';
    import type { NDKUser } from '@nostr-dev-kit/ndk';

    let { scope, ordering } = $page.params;
    let followsPromise: Promise<boolean> | undefined = undefined;

    $: {
        scope = $page.params.scope;
        ordering = $page.params.ordering;
    }

    function fetchFollowers() {
        if (!$currentUser) {
            setTimeout(fetchFollowers, 1000);
            return;
        }

        followsPromise = new Promise((resolve, reject) => {
            $currentUser?.follows().then((follows) => {
                $currentUserFollowPubkeys = Array.from(follows).map((u: NDKUser) => u.hexpubkey());
                resolve(true);
            });
        });
    }

    $: if (scope === 'network') {
        if (!$currentUserFollowPubkeys) {
            fetchFollowers();
        }
    }
</script>

{#if scope === 'network'}
    {#await followsPromise}
        <p>loading...</p>
    {:then}
        {#if ordering === 'newest'}
            <Newest {scope} />
        {:else if ordering === 'highlights'}
            <Highlights {scope} />
        {/if}
    {/await}
{:else}
    {#if ordering === 'newest'}
        <Newest {scope} />
    {:else if ordering === 'highlights'}
        <Highlights {scope} />
    {/if}
{/if}
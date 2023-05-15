<script lang="ts">
    import { currentUserFollowPubkeys, currentScope } from '$lib/store';
    import { page } from "$app/stores";

    import Newest from './newest.svelte';
    import Highlights from './highlights.svelte';
    import { fetchFollowers } from '$lib/currentUser';
    import { browser } from '$app/environment';

    let { scope, ordering } = $page.params;
    let followsPromise: Promise<void> | undefined = undefined;

    $: {
        scope = $page.params.scope;
        ordering = $page.params.ordering;
    }

    $: if (scope === 'network' && browser) {
        if (!$currentUserFollowPubkeys) {
            followsPromise = fetchFollowers();
        }
    }
</script>

{#if ordering === 'newest'}
    <Newest {scope} />
{:else if ordering === 'highlights'}
    <Highlights {scope} />
{/if}
<script lang="ts">
    import { currentUserFollowPubkeys, currentScope } from '$lib/store';
    import { page } from "$app/stores";

    import Newest from './newest.svelte';
    import Highlights from './highlights.svelte';
    import { fetchFollowers } from '$lib/currentUser';

    let { scope, ordering } = $page.params;
    let followsPromise: Promise<boolean> | undefined = undefined;

    $: {
        scope = $page.params.scope;
        ordering = $page.params.ordering;
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
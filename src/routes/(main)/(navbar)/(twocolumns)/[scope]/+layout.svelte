<script lang="ts">
    import { page } from '$app/stores';
    import { currentUserFollowPubkeys, currentScope, currentUser } from '$lib/store';
    import { fetchFollowers } from '$lib/currentUser';

    $: if ($page.params.scope !== $currentScope.label) {

        switch ($page.params.scope) {
            case 'personal':
                if ($currentUser) {
                    console.log(`setting personal scope to ${$currentUser.hexpubkey()}`)
                    $currentScope.pubkeys = [$currentUser.hexpubkey()];
                    $currentScope.label = $page.params.scope;
                }

                break;
            case 'network':
                if ($currentUserFollowPubkeys) {
                    $currentScope.pubkeys = $currentUserFollowPubkeys;
                    $currentScope.label = $page.params.scope;
                }
                break;
            case 'global':
                $currentScope.pubkeys = undefined;
                $currentScope.label = $page.params.scope;
                break;
        }
    }
</script>

{#key $currentScope.pubkeys}
    {#if $page.params.scope === 'network'}
        {#if $currentUserFollowPubkeys === undefined}
            {#await fetchFollowers()}
                Loading follow List
            {:then}
                <slot />
            {/await}
        {:else}
            <slot />
        {/if}
    {:else}
        <slot />
    {/if}
{/key}
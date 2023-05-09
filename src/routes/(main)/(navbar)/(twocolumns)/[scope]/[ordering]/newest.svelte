<script lang="ts">
    import { currentUser, currentUserFollowPubkeys } from '$lib/store';
    import type { ILoadOpts } from '$lib/interfaces/highlights';
    import HighlightList from '$lib/components/HighlightList.svelte';

    export let scope: string;
    let prevScope: string;

    let filter: ILoadOpts | undefined = undefined;

    $: if (prevScope !== scope) {
        prevScope = scope;

        let pubkeys: string[] | undefined;

        switch (scope) {
            case 'personal':
                pubkeys = [$currentUser?.hexpubkey()!];
                break;
            case 'network':
                pubkeys = $currentUserFollowPubkeys!;
                break;
        }

        filter = { pubkeys, sortBy: 'timestamp', limit: 5 };
    }
</script>

{#key filter}
    {#if filter}
        <HighlightList {filter} />
    {/if}
{/key}
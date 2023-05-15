<script lang="ts">
    import { currentUserFollowPubkeys, currentScope, currentUser } from '$lib/store';
    import MyHighlightsIcon from '$lib/icons/MyHighlights.svelte';
    import GlobalIcon from '$lib/icons/Global.svelte';
    import FollowsIcon from '$lib/icons/Follows.svelte';
    import { fade } from 'svelte/transition';
    import { fetchFollowers } from '$lib/currentUser';

    export let scope: string;
    export let urlTemplate: string | undefined = undefined;

    let showScopeMenu = false;

    function urlFor(scope: string) {
        if (urlTemplate) {
            return urlTemplate.replace('<scope>', scope);
        } else {
            return "#";
        }
    }

    function select(e: Event, value: string) {
        scope = value;
        showScopeMenu = false;
        $currentScope.label = value;

        switch (value) {
            case 'network':
                if (!$currentUserFollowPubkeys) {
                    fetchFollowers()?.then(() => {
                        // update the filter
                        $currentScope.pubkeys = $currentUserFollowPubkeys || [];
                    });

                    return;
                } else {
                    // update the filter
                    $currentScope.pubkeys = $currentUserFollowPubkeys;
                }
                break;
            case 'personal':
                if ($currentUser?.hexpubkey()) {
                    $currentScope.pubkeys = [$currentUser?.hexpubkey()];
                } else {
                    $currentScope.pubkeys = [];
                }
                break;
            case 'global':
                $currentScope.pubkeys = undefined;
        }

        if (!urlTemplate) {
            e.preventDefault();
        }
    }

    function valueToText(value: string) {
        switch (value) {
            case 'personal':
                return 'Personal';
            case 'network':
                return `My Network`;
            case 'global':
                return 'Global';
            case 'curated':
                return 'Curated List [coming soon]';
        }
    }

    const options = [
        'personal',
        'network',
        'global',
        'curated'
    ]
</script>

<div class="relative inline-block text-left">
    <div>
        <button class="
            inline-flex w-full
            justify-center gap-x-1.5
            rounded-md bg-white
            px-2 sm:px-4 py-2
            text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50
            capitalize
        " aria-expanded="true" aria-haspopup="true"
        on:click={() => { showScopeMenu = !showScopeMenu}}>
            {valueToText(scope)}
            <svg class="-mr-1 h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
            </svg>
        </button>
    </div>

    {#if showScopeMenu}
        <div class="
            absolute right-0 z-10 mt-2 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none
            duration-100 transition ease-out
            whitespace-nowrap
        " role="menu" aria-orientation="vertical" aria-labelledby="menu-button" tabindex="-1"
        transition:fade={{duration: 50}}>
            <div class="py-1" role="none">
                {#each options as option}
                    <a
                        href={urlFor(option)}
                        class="
                        block px-4 py-2 text-sm
                        transition duration-75 w-full
                        text-left
                        {option === 'curated' ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-beige-150 '}
                    " role="menuitem" tabindex="-1"
                    on:click={(e)=>{select(e, option)}}>
                        {valueToText(option)}
                    </a>
                {/each}
            </div>
        </div>
    {/if}
</div>
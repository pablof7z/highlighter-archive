<script lang="ts">
    import {createEventDispatcher} from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';

    export let route: string;
    let active: boolean;

    // define active if the current URL starts with the route
    $: {
        active = $page?.url?.pathname === route;
    }
</script>

<button on:click|preventDefault={() => goto(route)} class="
    group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold
    w-full
    { active ? 'bg-gray-50 text-orange-500' : 'text-gray-700 hover:text-orange-500 hover:bg-gray-50' }
">
    <slot />
</button>
<script lang="ts">
    import {createEventDispatcher} from 'svelte';
    export let href: string = '#';

    const dispatch = createEventDispatcher();
</script>

<a href={href}
    class="inline-flex items-center gap-x-2 rounded-md bg-gradient-to-br from-orange-500 to-red-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-orange-600 hover:to-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500
" on:click={() => dispatch('click')}>
    <slot />
</a>
<script lang="ts">
    import { page } from '$app/stores';
    import { createEventDispatcher } from 'svelte';

    export let href: string;
    export let klass: string | undefined;
    export let activeKlass: string | undefined;

    const dispatch = createEventDispatcher();

    let currentClass = klass || '';

    $: {
        if ($page.url.pathname === href) {
            currentClass = activeKlass || '';
        } else {
            currentClass = klass || '';
        }
    }
</script>

<a {href} on:click={e => dispatch('click')} class={`flex flex-row items-center gap-2 ${currentClass}`}>
    <slot />
</a>

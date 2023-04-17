<script lang="ts">
    import {createEventDispatcher} from 'svelte';

    const dispatch = createEventDispatcher();

    export let group: string;
    export let value: string;

    $: active = group === value;

    function onClick() {
        const prevValue = group;
        group = value;
        if (prevValue !== value)
            dispatch("change", value);
    }
</script>

<button class="
    flex flex-row gap-2 items-center
    tracking-wider p-3
    outline-none
    rounded-lg
    transition duration-150
    {active ? 'font-semibold' : 'font-normal'}
    {active ? 'text-white' : 'text-zinc-500 hover:text-white'}
    {active ? 'bg-zinc-700' : 'bg-transparent'}
    " on:click={onClick}
>
    <slot />
</button>
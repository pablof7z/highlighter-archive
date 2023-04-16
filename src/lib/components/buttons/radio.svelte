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
    tracking-wider pb-2 px-4
    outline-none
    {active ? 'font-semibold' : 'font-normal'}
    {active ? 'text-orange-500' : 'text-gray-500 hover:text-white'}
    {active ? 'border-b border-orange-500' : 'border-b border-gray-500 hover:border-white'}
    " on:click={onClick}
>
    <slot />
</button>
<script lang="ts">
    import ViewIcon from '$lib/icons/View.svelte';
    import { Tooltip } from 'flowbite-svelte';

    export let note: App.Note;
</script>

<button class="w-fit"
    on:click={() => {
        navigator.clipboard.writeText(note.event);
    }}
>
    <ViewIcon />
</button>
<Tooltip  color="black">Copy event JSON</Tooltip>
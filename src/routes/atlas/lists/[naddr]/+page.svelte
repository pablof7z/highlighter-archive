<script lang="ts">
    import { page } from "$app/stores";
    import List from "./list.svelte";

    let naddr: string;

    $: {
        naddr = $page.params.naddr;
    }
</script>

{#key naddr}
    <List {naddr} />
{/key}
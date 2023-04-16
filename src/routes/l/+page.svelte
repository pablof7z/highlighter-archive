<script lang="ts">
    import { page } from '$app/stores';
    import { onMount } from 'svelte';
    import Widget from '../../Widget.svelte';
    let url = $page.url.searchParams.get('url') || '';
    let html: string;

    onMount(async () => {
        const response = await fetch(`https://thingproxy.freeboard.io/fetch/${url}`);
        html = await response.text();
    });
</script>


{@html html}

<Widget />

<style>
    :global(body) {
        background-color: white !important;
    }
</style>
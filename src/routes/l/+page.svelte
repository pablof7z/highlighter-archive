<script lang="ts">
    import { page } from '$app/stores';
    import { onMount } from 'svelte';
    import Widget from '../../Widget.svelte';
    let url = $page.url.searchParams.get('url') || '';
    let html: string;
    let error: string;
    let loadWidget = false;

    onMount(async () => {
        try {
            const response = await fetch(`https://thingproxy.freeboard.io/fetch/${url}`);
            html = await response.text();
            loadWidget = true;
        } catch (e) {
            error = e;
        }
    });
</script>

{#if !html && error}
    Trying to load {url}: {error}
{/if}
{@html html}

{#if loadWidget}
    <Widget {url} />
{/if}

<style>
    :global(body) {
        background-color: white !important;
    }
</style>
<script lang="ts">
    import Console from '$lib/components/Console.svelte';
    import { page } from '$app/stores';

    let url: string = $page.url.searchParams.get('url') || '';
    let authorPubkey: string = $page.url.searchParams.get('author') || '';
</script>

<svelte:head>
	<title>Highlighter Console</title>
	<meta name="description" content="Unleash valuable words from their artificial silos" />
</svelte:head>

<main class="max-w-2xl mx-auto pb-32 flex flex-col items-center gap-6">
    <Console {url} {authorPubkey} />
</main>
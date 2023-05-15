<script lang="ts">
	import GenericEventCard from '$lib/components/events/generic/card.svelte';
    import { page } from '$app/stores';
    import { nip19 } from 'nostr-tools';

    let { note } = $page.params;
</script>

<svelte:head>
	<title>HIGHLIGHTER.com</title>
	<meta name="description" content="Unleash valuable words from their artificial silos" />
</svelte:head>

{#key note}
    <main class="max-w-xl mx-auto pb-32">
        <GenericEventCard
            id={note}
        />
    </main>
{/key}
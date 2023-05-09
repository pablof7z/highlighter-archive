<script lang="ts">
	import HighlightsNavigationMenu from '../HighlightsNavigationMenu.svelte';

	import { currentUser, backgroundBanner } from '$lib/store';
	import HighlightList from '$lib/components/HighlightList.svelte';

    $backgroundBanner = null;
</script>

<svelte:head>
	<title>HIGHLIGHTER.com</title>
	<meta name="description" content="Unleash valuable words from their artificial silos" />
</svelte:head>

<main class="max-w-2xl mx-auto pb-32">
	<HighlightsNavigationMenu />

    {#if $currentUser?.hexpubkey()}
        <HighlightList filter={{ pubkeys: [$currentUser?.hexpubkey()] }} />
    {/if}
</main>
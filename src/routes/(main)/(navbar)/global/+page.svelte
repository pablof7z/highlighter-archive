<script lang="ts">
	import HighlightsNavigationMenu from '../HighlightsNavigationMenu.svelte';

	import { backgroundBanner } from '$lib/store';
	import HighlightList from '$lib/components/HighlightList.svelte';

    $backgroundBanner = null;
</script>

<svelte:head>
	<title>HIGHLIGHTER.com</title>
	<meta name="description" content="Unleash valuable words from their artificial silos" />
</svelte:head>

<main class="max-w-2xl mx-auto pb-32">
	<HighlightsNavigationMenu />

    <HighlightList filter={{ limit: 50 }} />
</main>
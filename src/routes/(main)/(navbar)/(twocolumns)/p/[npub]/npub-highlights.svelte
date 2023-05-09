<script lang="ts">
    import HighlightList from '$lib/components/HighlightList.svelte';
    import UserBanner from '$lib/components/UserBanner.svelte';
    import HighlightPage from '../../[scope]/[ordering]/highlights.svelte';

    import UserInterface from '$lib/interfaces/users';

    export let pubkey: string;
</script>

<UserBanner {pubkey} />

<HighlightPage {pubkey} maxHighlightCountToShow={10} skipHighlighter={true} />

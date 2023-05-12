<script lang="ts">
    import UserBanner from '$lib/components/UserBanner.svelte';
    import HighlightPage from '../../[scope]/[ordering]/highlights.svelte';

    export let pubkey: string;
</script>

<UserBanner {pubkey} />

<HighlightPage
    scope="pubkey"
    {pubkey}
    maxHighlightCountToShow={10}
    skipHighlighter={true}
/>

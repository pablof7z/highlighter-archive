<script lang="ts">
    import Tags from './tags.svelte';
    import type NDKEvent from '@nostr-dev-kit/ndk/lib/src/events';

    export let listEvent: NDKEvent;
    export let tags: NDKTag[] = [];
    export let encryptedTags: NDKTag[] = [];
</script>

{#if encryptedTags}
    <Tags tags={encryptedTags} kind={4} />
{/if}

<Tags tags={tags} />
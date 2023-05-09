<script lang="ts">
    import { openModal } from 'svelte-modals'
    import { Tooltip } from 'flowbite-svelte';

    import BookmarkIcon from '$lib/icons/Bookmark.svelte';

    import BookmarkModal from '$lib/modals/Bookmark.svelte';

    import type { NDKEvent } from '@nostr-dev-kit/ndk';

    export let event: NDKEvent;
</script>

<button
    class="text-slate-500 hover:text-purple-700"
    on:click={() => { openModal(BookmarkModal, { event }) }}
><BookmarkIcon /></button>
<Tooltip  color="black">Bookmark</Tooltip>
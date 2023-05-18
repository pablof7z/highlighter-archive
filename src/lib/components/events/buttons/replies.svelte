<script lang="ts">
    import { openModal } from 'svelte-modals'
    import { Tooltip } from 'flowbite-svelte';

    import CommentIcon from '$lib/icons/Comment.svelte';

    import ReplyModal from '$lib/modals/Reply.svelte';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';

    export let event: NDKEvent;
    export let note: App.Note | undefined = undefined;
    export let highlight: App.Highlight | undefined = undefined;
    export let replies: App.Note[];
</script>

<button class="
    text-slate-500 hover:text-orange-500
    flex flex-row items-center gap-2
" on:click={() => { openModal(ReplyModal, { event, note, highlight }) }}>
    <CommentIcon />
</button>
<Tooltip color="black">Reply</Tooltip>
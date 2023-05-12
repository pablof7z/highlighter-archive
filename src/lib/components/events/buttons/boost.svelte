<script lang="ts">
	import { NDKEvent } from '@nostr-dev-kit/ndk';

    import BoostIcon from '$lib/icons/Boost.svelte';
    import { Tooltip } from 'flowbite-svelte';
    import ndk from '$lib/stores/ndk';
    import type { NostrEvent } from '@nostr-dev-kit/ndk/lib/src/events';

    import { openModal } from 'svelte-modals'
    import BoostModal from '$lib/modals/Boost.svelte';

    export let event: NDKEvent;
    export let note: App.Note | undefined = undefined;
    export let highlight: App.Highlight | undefined = undefined;

    let eventJSON = note?.event || highlight?.event;

    async function boost() {
        event = new NDKEvent($ndk, JSON.parse(eventJSON!));

        const tags = [];
        tags.push(event.tagReference());

        const pTag = event.getMatchingTags('p')[0];
        if (pTag && pTag[1]) {
            tags.push(['p', pTag[1], "highlighter"]);
        }

        const boostEvent = new NDKEvent($ndk, {
            content: JSON.stringify(event.rawEvent()),
            created_at: Math.floor(Date.now() / 1000),
            kind: 6,
            tags,
        } as NostrEvent);

        await boostEvent.sign();
        await boostEvent.publish();

        alert('event boosted; displaying boosts is WIP -- BRB! 😉')
    }
</script>

<button class="
    text-slate-500 hover:text-orange-500
    flex flex-row items-center gap-2
" on:click={() => { openModal(BoostModal, { event, highlight }) }}>
    <BoostIcon />
</button>
<Tooltip  color="black">Boost</Tooltip>

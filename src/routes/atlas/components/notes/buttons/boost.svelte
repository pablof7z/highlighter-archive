<script lang="ts">
	import { NDKEvent } from '@nostr-dev-kit/ndk';

    import BoostIcon from '$lib/icons/Boost.svelte';
    import { Tooltip } from 'flowbite-svelte';
    import { ndk } from '$lib/store';
    import type { NostrEvent } from '@nostr-dev-kit/ndk/lib/src/events';

    export let note: App.Note;

    async function boost() {
        let noteEvent = new NDKEvent($ndk, JSON.parse(note.event));

        const tags = [];
        tags.push(noteEvent.tagReference());

        const pTag = noteEvent.getMatchingTags('p')[0];
        if (pTag && pTag[1]) {
            tags.push(['p', pTag[1], "highlighter"]);
        }

        const boostEvent = new NDKEvent($ndk, {
            content: JSON.stringify(noteEvent.rawEvent()),
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
" on:click={boost}>
    <BoostIcon />
</button>
<Tooltip  color="black">Boost</Tooltip>
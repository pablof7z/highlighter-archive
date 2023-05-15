<script lang="ts">
    import HighlightCard from '$lib/components/highlights/card.svelte';
    import NoteCard from '$lib/components/notes/card.svelte';
    import { handleEvent1 } from '$lib/interfaces/notes';
    import { handleEvent9802 } from '$lib/interfaces/highlights';
    import ndk from '$lib/stores/ndk';
    import { nip19 } from 'nostr-tools';
    import { createEventDispatcher } from 'svelte';
    import type { NDKEvent } from '@nostr-dev-kit/ndk';

    export let id: string;
    export let skipReplies: boolean = false;

    const dispatcher = createEventDispatcher();

    let hexid: string;
    const decoded = nip19.decode(id);

    if (decoded.type === 'nevent') {
        hexid = decoded.data.id as string;
    } else {
        hexid = decoded.data as string;
    }
    console.log({hexid});

    async function loadEvent(): Promise<NDKEvent | undefined> {
        const p: Promise<NDKEvent | undefined> = new Promise((resolve, reject) => {
            $ndk.fetchEvent({ids: [hexid]}).then((e) => {
                if (!e) return reject(`no event ${hexid}`);

                dispatcher('event:load', e);
                resolve(e);
            });
        });

        return p;
    }
</script>

{#await loadEvent()}
    loading {hexid}
{:then e}
    {#if e}
        {#if e.kind === 9802}
            <div class="border rounded-lg border-zinc-300">
                <HighlightCard
                    highlight={handleEvent9802(e)}
                    skipTitle={true}
                />
            </div>
        {:else if e.kind === 1}
            <NoteCard
                note={handleEvent1(e)}
                skipTitle={true}
                {skipReplies}
            />
        {:else}
            event {e.kind}
        {/if}
    {:else}
        @{id}
    {/if}
{:catch e}
    {e}
{/await}
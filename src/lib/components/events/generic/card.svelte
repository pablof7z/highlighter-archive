<script lang="ts">
    import HighlightCard from '$lib/components/highlights/card.svelte';
    import NoteCard from '$lib/components/notes/card.svelte';
    import { handleEvent1 } from '$lib/interfaces/notes';
    import { handleEvent9802 } from '$lib/interfaces/highlights';
    import ndk from '$lib/stores/ndk';
    import { nip19 } from 'nostr-tools';
    import { createEventDispatcher } from 'svelte';
    import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';

    export let id: string | undefined = undefined;
    export let skipReplies: boolean = false;
    export let event: NDKEvent | undefined = undefined;

    const dispatcher = createEventDispatcher();

    let hexid: string = event?.id;

    if (id) {
        const decoded = nip19.decode(id);

        if (decoded.type === 'nevent') {
            hexid = decoded.data.id as string;
        } else {
            hexid = decoded.data as string;
        }
    }

    async function loadEvent(): Promise<NDKEvent | undefined> {
        if (event) return event;

        const p: Promise<NDKEvent | undefined> = new Promise((resolve, reject) => {
            $ndk.fetchEvent({ids: [hexid]}).then((e) => {
                if (!e) return reject(`no event ${hexid}`);

                dispatcher('event:load', e);
                resolve(e);
            });
        });

        return p;
    }

    function dragStart(dragEvent: DragEvent, ndkEvent: NDKEvent) {
        if (!dragEvent.dataTransfer) return;

        const tag = ndkEvent.tagReference();

        dragEvent.dataTransfer.setData('id', ndkEvent.id as string);
        dragEvent.dataTransfer.setData('tag', JSON.stringify(tag));
    }
</script>

{#await loadEvent()}
    loading {hexid}
{:then e}
    {#if e}
        <div
            draggable={true}
            on:dragstart={(dragEvent) => dragStart(dragEvent, e)}
        >
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
                    {skipReplies}
                />
            {/if}
        </div>
    {:else}
        @{id}
    {/if}
{:catch e}
    {e}
{/await}
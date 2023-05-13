<script lang="ts">
    import HighlightCard from '$lib/components/highlights/card.svelte';
    import { handleEvent9802 } from '$lib/interfaces/highlights';
    import ndk from '$lib/stores/ndk';
    import { nip19 } from 'nostr-tools';

    export let id: string;

    let hexid = nip19.decode(id).data as string;
</script>

{#await $ndk.fetchEvent({ids: [hexid]})}
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
        {/if}
    {:else}
        @{id}
    {/if}
{:catch e}
    {e}
{/await}
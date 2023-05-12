<script lang="ts">
    import { openModal } from 'svelte-modals'
    import { Tooltip } from 'flowbite-svelte';

    import ZapInterface from '$lib/interfaces/zap';

    import ZapIcon from '$lib/icons/Zap.svelte';

    import ZapModal from '$lib/modals/Zap.svelte';
    import { onMount } from 'svelte';

    export let note: App.Note | undefined = undefined;
    export let highlight: App.Highlight | undefined = undefined;

    let eventId = note?.id || highlight?.id;

    let zappedAmount: number = 0;
    let zaps;

    onMount(() => {
        zaps = ZapInterface.load({eventId});
    });

    if ($zaps) {
        zappedAmount = $zaps.reduce((acc: number, zap: App.Zap) => {
            return acc + zap.amount;
        }, 0);
    }
</script>

<button class="
    text-slate-500 hover:text-orange-500
    flex flex-row items-center gap-2
" on:click={() => { openModal(ZapModal, { note, highlight }) }}>
    <ZapIcon />
    {zappedAmount}
</button>
<Tooltip  color="black">Zap</Tooltip>
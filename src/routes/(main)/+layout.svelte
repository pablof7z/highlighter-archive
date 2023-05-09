<script lang="ts">
    import { Modals, closeModal } from 'svelte-modals'
    import { fade } from 'svelte/transition'
</script>

<div class="min-h-full">
    <slot />
</div>

<Modals>
    <div
        slot="backdrop"
        class="backdrop"
        on:click={closeModal}
        transition:fade={{ duration: 100 }}>
    />
</Modals>

<style>
    .backdrop {
        position: fixed;
        z-index: 99999;
        top: 0;
        bottom: 0;
        right: 0;
        backdrop-filter: blur(0.15rem);
        left: 0;
        background: rgba(0,0,0,0.50)
    }

    :global(.modal) {
        z-index: 99999999;
    }

    :global(html) {
        background: #fafaff;
    }

    :global(div[role="tooltip"]) {
        background: #000000;
        color: #ffffff;
        border: 1px solid #e2e8f0;
    }
</style>
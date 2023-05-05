<script lang="ts">
    import Navbar from './components/Navbar.svelte';
    import { Modals, closeModal } from 'svelte-modals'
    import { fade } from 'svelte/transition'

    import { backgroundBanner } from '$lib/store';
</script>

<div class="relative w-full h-64">
    <div class="bg-black/50 border-b border-black backdrop-blur-xl fixed w-full z-30">
        <Navbar />
    </div>

    {#if $backgroundBanner}
        <div
            class="absolute inset-0 w-full h-full bg-center bg-cover z-0"
            style={`background-image: url(${$backgroundBanner})`}
        />
        <div
            class="absolute py-6 inset-0 w-full h-full bg-gradient-to-b from-transparent to-black z-1"
        />
    {/if}
</div>

<div class="absolute w-full h-full top-0 z-10">
    <div class="flex flex-row relative pt-24">
        <slot />
    </div>
</div>

<Modals>
    <div
        slot="backdrop"
        class="backdrop"
        on:click={closeModal}
        transition:fade>
    />
</Modals>

<style>
    :global(html) {
        background-color: #1a1a1a;
    }

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
</style>
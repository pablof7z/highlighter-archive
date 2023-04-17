<script lang="ts">
    import { ndk } from '$lib/store';
    import { onMount } from 'svelte';
    import { NDKNip07Signer } from "@nostr-dev-kit/ndk";
    import { Modals, closeModal } from 'svelte-modals'
    import { fade } from 'svelte/transition'

    onMount(async () => {
        try {
            $ndk.signer = new NDKNip07Signer();
        } catch (e) {
            console.error(e);
        }
        await $ndk.connect();
    });
</script>

<slot />

<Modals>
    <div
        slot="backdrop"
        class="backdrop"
        on:click={closeModal}
        transition:fade>
    />
</Modals>

<style>
    .backdrop {
        position: fixed;
        top: 0;
        bottom: 0;
        right: 0;
        backdrop-filter: blur(0.15rem);
        left: 0;
        background: rgba(0,0,0,0.50)
    }

	@tailwind base;
	@tailwind components;
	@tailwind utilities;
</style>
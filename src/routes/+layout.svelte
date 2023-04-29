<script lang="ts">
    import { ndk, currentUser } from '$lib/store';
    import { onMount } from 'svelte';
    import { NDKNip07Signer } from "@nostr-dev-kit/ndk";
    import { Modals, closeModal } from 'svelte-modals'
    import { fade } from 'svelte/transition'

    // move to NDK's nip-07 signer
    async function tryToLoadNip07(delay = 0) {
        if (delay > 2000) {
            alert('It looks like you do not have a NIP-07 extension (like getalby or nos2x; you need to install that in your browser to use Highlighter');
            return;
        }

        if (window.nostr) {
            try {
                $ndk.signer = new NDKNip07Signer();
                $currentUser = await $ndk.signer.user();
                $currentUser.ndk = $ndk;
                console.log('currentUser', $currentUser);

                $ndk = $ndk;
            } catch (e) {
                alert('no nip-07')
                console.error(e);
            }
        } else {
            delay += 100
            setTimeout(() => tryToLoadNip07(delay), delay);
        }
    }

    onMount(async () => {
        tryToLoadNip07();
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
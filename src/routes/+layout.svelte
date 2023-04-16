<script lang="ts">
    import { ndk } from '$lib/store';
    import { onMount } from 'svelte';
    import { NDKNip07Signer } from "@nostr-dev-kit/ndk";

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

<style>
	@tailwind base;
	@tailwind components;
	@tailwind utilities;
</style>
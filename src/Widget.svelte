<script lang="ts">
    import { ndk } from '$lib/store';
    import { NDKNip07Signer } from "@nostr-dev-kit/ndk";
    import { onMount } from 'svelte';
    import Container from './Container.svelte';
    import HighlightInterface from '$lib/interfaces/highlights.js';
    import { highlightText } from '$lib/utils';

    let minimizeChat = true;
    export let loadHighlights = true;
    export let position = 'top-5 right-5 flex-col';
    let highlights;
    let replacedHighlights: Record<string, boolean> = {};

    onMount(async () => {
        try {
            $ndk.signer = new NDKNip07Signer();
        } catch (e) {
            console.error(e);
        }
        await $ndk.connect();

        const url = new URL(window.location.href);

        if (loadHighlights) {
            highlights = HighlightInterface.load({ url: url.href });
        }
    })

    function toggleChat() {
        minimizeChat = !minimizeChat;
    }

    $: {
        if ($highlights && $highlights.length > 0) {
            // @ts-ignore
            for (const highlight of $highlights) {
                if (replacedHighlights[highlight.id]) continue;
                console.log(highlight.id, highlight.content);

                try {
                    replacedHighlights[highlight.id] = true; // don't retry if it failed
                    highlightText(highlight.content);
                } catch (e) {
                    console.error(e);
                    continue;
                }
            }
        }
    }
</script>

<div class={`fixed mb-5 flex items-end justify-end font-sans ${position}`} style="z-index: 9999999;">
    <div class={position.includes('left') ? 'self-start' : 'self-end'}>
        <a href="#" class="
            text-white bg-purple-900 hover:bg-purple-700 w-16 h-16 p-5
            rounded-full text-center
            flex flex-row items-center justify-center gap-4
            text-xl font-black
        " on:click|preventDefault={toggleChat}>
            {#if $highlights?.length > 0}
                {$highlights?.length}
            {:else}
                📝
            {/if}
        </a>
    </div>
    <div class="
        shadow-2xl
        bg-white/90 backdrop-brightness-150 backdrop-blur-md mb-5 w-96 max-w-screen-sm text-black rounded-3xl p-5
        overflow-auto
        flex flex-col justify-end
        {minimizeChat ? 'hidden' : ''}
    " style="max-height: 80vh;">
        <Container />
    </div>
</div>

<style>
	@tailwind base;
	@tailwind components;
	@tailwind utilities;
</style>
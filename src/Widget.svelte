<script lang="ts">
    import { ndk } from '$lib/store';
    import { NDKNip07Signer } from "@nostr-dev-kit/ndk";
    import { onMount } from 'svelte';
    import Container from './Container.svelte';
    import Highlight from '$lib/components/Highlight.svelte';
    import HighlightInterface from '$lib/interfaces/highlights.js';
    import { highlightText } from '$lib/utils';
    import {nip19} from 'nostr-tools';

    let minimizeChat = true;
    export let url: string;
    export let loadHighlights = true;
    export let position = 'top-5 right-5 flex-col';
    let replacedHighlights: Record<string, boolean> = {};
    let highlights;
    let _highlights: App.Highlight[] = [];

    onMount(async () => {
        try {
            $ndk.signer = new NDKNip07Signer();
        } catch (e) {
            console.error(e);
        }
        await $ndk.connect();

        if (!url) url = (new URL(window.location.href)).href;

        if (loadHighlights && url) {
            setTimeout(() => {
                highlights = HighlightInterface.load({ url });
            }, 1000);
        }

        // create a trigger at the document level so that every time an element with [data-highlight-id] is clicked, we can
        // open a popup with a URL with the ID
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const highlightId = target.getAttribute('data-highlight-id');

            if (highlightId) {
                const highlight = _highlights.find(h => h.id === highlightId);

                if (highlight) {
                    const noteEncode = nip19.noteEncode(highlight.id);
                    const url = new URL('http://localhost:5173/e/'+noteEncode);
                    window.open(url.href, '_blank');
                }
            }
        });
    })

    function toggleChat() {
        minimizeChat = !minimizeChat;
    }

    $: {
        if ($highlights && $highlights.length > 0) {
            // @ts-ignore
            for (const highlight of $highlights) {
                if (replacedHighlights[highlight.id]) continue;

                try {
                    replacedHighlights[highlight.id] = true; // don't retry if it failed
                    highlightText(highlight.content, highlight.id);
                } catch (e) {
                    console.error(e);
                    continue;
                }
            }
        }

        _highlights = ($highlights || []) as App.Highlight[];
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
        <Container {url} />
    </div>
</div>

<style>
	@tailwind base;
	@tailwind components;
	@tailwind utilities;
</style>
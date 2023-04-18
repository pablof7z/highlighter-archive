<script lang="ts">
    import { ndk } from '$lib/store';
    import { NDKNip07Signer } from "@nostr-dev-kit/ndk";
    import { onMount } from 'svelte';
    import Container from './Container.svelte';
    import HighlightInterface from '$lib/interfaces/highlights.js';
    import { highlightText } from '$lib/utils';
    import {nip19} from 'nostr-tools';

    let minimizeWidget = true;
    export let url: string | undefined = undefined;
    export let loadHighlights = true;
    export let position = 'top-5 right-5 flex-col';
    export let explicitAuthorHexpubkey: string | undefined = undefined;
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

        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const highlightId = target.getAttribute('data-highlight-id');

            if (highlightId) {
                const highlight = _highlights.find(h => h.id === highlightId);

                if (highlight) {
                    const noteEncode = nip19.noteEncode(highlight.id);
                    const url = new URL('https://zapworthy.com/e/'+noteEncode);
                    window.open(url.href, '_blank');
                }
            }
        });
    })

    function toggleWidget() {
        minimizeWidget = !minimizeWidget;
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

<div class="
    mx-5 fixed mb-5 flex flex-col items-end justify-end font-sans {position}
    rounded-full backdrop-brightness-150 backdrop-blur-sm p-2
    overflow-auto gap-6
" style="z-index: 9999999;">
    <div class="{position.includes('left') ? 'self-start' : 'self-end'}">
        <a href="#" class="
            w-16 h-16 p-0
            rounded-full text-center
            flex flex-row items-center justify-center gap-4
            transition-all duration-300
        " on:click|preventDefault={toggleWidget}>
            <img src="https://b0e77f76a9f6.ngrok.app/images/logo.png" class="rounded-full" />
        </a>
    </div>
    {#if !minimizeWidget}
        <Container {url} {explicitAuthorHexpubkey} />
    {/if}
</div>

<style>
	@tailwind base;
	@tailwind components;
	@tailwind utilities;

    :global(mark[data-highlight-id]) {
        cursor: pointer;
    }

</style>
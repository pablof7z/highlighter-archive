<script lang="ts">
    import { ndk } from './lib/store';
    import KeyPrompt from './KeyPrompt.svelte';
    import {Readability, isProbablyReaderable } from '@mozilla/readability';
    import { onMount } from 'svelte';
    import {NDKEvent} from '@nostr-dev-kit/ndk';
    import TurndownService from "turndown";
    import {nip19} from 'nostr-tools';
    import type { AddressPointer } from 'nostr-tools/lib/nip19';

    let probablyReaderable: boolean;

    function markHighlightInDoc(range: Range) {
        const selectedText = range?.toString();

        // Create a span element to wrap the selected text
        const span = document.createElement('span');
        span.style.backgroundColor = 'yellow';
        span.textContent = selectedText;

        // Replace the selected text with the highlighted span
        range.deleteContents();
        range.insertNode(span);
    }

    async function highlightText() {
        const selection = window.getSelection();
        const range = selection?.getRangeAt(0);

        if (!range) return;

        const selectedText = range.toString();
        markHighlightInDoc(range);

        // check if this url has an naddr on the path
        // if so, publish to that naddr
        const url = new URL(window.location.href);
        const pathParts = url.pathname.split('/');
        const lastPathPart = pathParts[pathParts.length - 1];
        let naddr;
        let tags = [];
        if (lastPathPart.startsWith('naddr')) {
            naddr = lastPathPart;

            const decode = nip19.decode(naddr).data as AddressPointer;
            if (!decode) return;
            const id = `${decode.kind}:${decode.pubkey}:${decode.identifier}`;
            tags.push(['a', id]);
            tags.push(['p', decode.pubkey]);
        }

        const event = new NDKEvent($ndk, {
            kind: 9801,
            content: selectedText,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['r', window.location.href],
                ...tags,
            ],
        } as any);
        await event.sign();
        console.log(await event.toNostrEvent());
        await $ndk.publish(event);
    }

    async function publishNip28() {
        const reader = new Readability(document);
        let article;
        let tags = [];

        try {
            article = reader.parse();
            if (!article) return;
        } catch (e: any) {
            alert(e.message);
            return;
        }

        article.title && tags.push(['title', article.title]);
        article.excerpt && tags.push(['excerpt', article.excerpt]);
        article.siteName && tags.push(['siteName', article.siteName]);
        article.byline && tags.push(['byline', article.byline]);
        article.textContent && tags.push(['textContent', article.textContent]);
        article.length && tags.push(['length', article.length.toString()]);

        tags.push(['r', window.location.href]);
        tags.push(['published_at', Math.floor(Date.now() / 1000).toString()]);

        const turndownService = new TurndownService();
        const content = turndownService.turndown(article.content);

        const postEvent = new NDKEvent($ndk, {
            kind: 9801,
            content,
            created_at: Math.floor(Date.now() / 1000),
            tags,
        } as any);

        console.log(await postEvent.toNostrEvent());

        await postEvent.sign();
        alert(await postEvent.encode());
        await $ndk.publish(postEvent);
    }

    onMount(() => {
        const reader = new Readability(document);
        probablyReaderable = isProbablyReaderable(document);
        $ndk.connect();
    });
</script>

{#if !$ndk?.signer}
    <KeyPrompt />
{:else}
    {#if probablyReaderable || true}
        <button
            on:click={publishNip28}
        >
            Publish as NIP-23
        </button>
    {/if}
    <button
        class="bg-black text-white"
        on:click={highlightText}
    >highlight</button>
{/if}

<style>
	@tailwind base;
	@tailwind components;
	@tailwind utilities;
</style>
<script lang="ts">
    import ndk from './lib/stores/ndk';
    import KeyPrompt from './KeyPrompt.svelte';
    import {Readability, isProbablyReaderable } from '@mozilla/readability';
    import { onMount, onDestroy } from 'svelte';
    import {NDKEvent} from '@nostr-dev-kit/ndk';
    import TurndownService from "turndown";
    import {nip19} from 'nostr-tools';
    import type { AddressPointer } from 'nostr-tools/lib/nip19';

    export let url: string | undefined = undefined;
    export let explicitAuthorHexpubkey: string | undefined = undefined;
    let prevUrl: string;
    let probablyReaderable: boolean;
    let isNaddr: boolean;
    let activeSelection: string;

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

        if (!range) {
            alert('Select some text first');
            return;
        }

        const selectedText = range.toString();

        if (selectedText.length === 0) {
            alert('Select some text first');
            return;
        }

        markHighlightInDoc(range);

        // check if this url has an naddr on the path
        // if so, publish to that naddr
        const currentUrl = new URL(url);
        const pathParts = currentUrl.pathname.split('/');
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
        } else if (explicitAuthorHexpubkey) {
            tags.push(['p', explicitAuthorHexpubkey]);
        }

        const event = new NDKEvent($ndk, {
            kind: 9802,
            content: selectedText,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['r', url],
                ...tags,
            ],
        } as any);
        await event.sign();
        await $ndk.publish(event);
    }

    async function publishNip23() {
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
            kind: 9802,
            content,
            created_at: Math.floor(Date.now() / 1000),
            tags,
        } as any);

        await postEvent.sign();
        await $ndk.publish(postEvent);
    }

    onMount(() => {
        if (!url) url = (new URL(window.location.href)).href;
        $ndk.connect();

        document.addEventListener('selectionchange', handleSelectionChange);
    });

    function handleSelectionChange() {
        const selection = window.getSelection();
        const range = selection?.getRangeAt(0);

        if (!range) return;

        activeSelection = range.toString();
    }

    function isNip23() {
        const currentUrl = new URL(url);
        const pathParts = currentUrl.pathname.split('/');
        const lastPathPart = pathParts[pathParts.length - 1];
        isNaddr = lastPathPart.startsWith('naddr');

        return isNaddr;
    }

    $: {
        if (url !== prevUrl) {
            if (!isNip23()) {
                probablyReaderable = isProbablyReaderable(document);
            }

            prevUrl = url;
        }
    }
</script>

{#if !$ndk?.signer}
    <KeyPrompt />
{:else}
    {#if probablyReaderable}
        <button class="
            flex flex-col items-center justify-center
            text-white
            bg-purple-700 hover:bg-orange-500
            transition-all duration-300
            w-16 h-16 rounded-full
        " on:click={publishNip23} title="Publish as NIP-23">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
                <path fill-rule="evenodd" d="M15.75 2.25H21a.75.75 0 01.75.75v5.25a.75.75 0 01-1.5 0V4.81L8.03 17.03a.75.75 0 01-1.06-1.06L19.19 3.75h-3.44a.75.75 0 010-1.5zm-10.5 4.5a1.5 1.5 0 00-1.5 1.5v10.5a1.5 1.5 0 001.5 1.5h10.5a1.5 1.5 0 001.5-1.5V10.5a.75.75 0 011.5 0v8.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V8.25a3 3 0 013-3h8.25a.75.75 0 010 1.5H5.25z" clip-rule="evenodd" />
            </svg>
        </button>
    {/if}
    <button class="
        flex flex-col items-center justify-center
        text-white
        bg-purple-700 hover:bg-orange-500
        transition-all duration-300
        w-16 h-16 rounded-full
    " title="Highlight" on:click={highlightText}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
            <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
        </svg>
    </button>
{/if}

<style>
	@tailwind base;
	@tailwind components;
	@tailwind utilities;
</style>
<script lang="ts">
    import Widget from '../../Widget.svelte';
    import { ndk } from '$lib/store';
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { fetchArticle } from '$lib/article';
    import Article from '$lib/components/Article.svelte';
    import ArticleInterface from '$lib/interfaces/article';
    import {NDKEvent} from '@nostr-dev-kit/ndk';
    import TurndownService from "turndown";
    import {nip19} from 'nostr-tools';
    import { goto } from '$app/navigation';

    let url = $page.url.searchParams.get('url') || '';
    let _url = url;
    let article: any;

    let articles;
    let _articles: App.Article[] = [];

    let authorPubkey: string;

    $: {
        _articles = ($articles || []) as App.Article[];

        if (_articles[0]) {
            const {id} = _articles[0];
            goto(`/a/${id}`);
        }
    }

    onMount(async () => {
        setTimeout(() => {
            articles = ArticleInterface.load({url});
        }, 1000);

        if (url !== '') {
            loadUrl();
        }
    });

    async function loadUrl() {
        articles = ArticleInterface.load({url});
        article = await fetchArticle(url);
    }

    async function publishNip28() {
        let tags = [];

        if (authorPubkey) {
            const hexauthorpubkey = nip19.decode(authorPubkey).data;

            if (hexauthorpubkey) {
                tags.push(['p', hexauthorpubkey]);
                tags.push(['author', hexauthorpubkey]);
            }
        }

        article.title && tags.push(['title', article.title]);
        article.excerpt && tags.push(['excerpt', article.excerpt]);
        article.siteName && tags.push(['siteName', article.siteName]);
        article.byline && tags.push(['byline', article.byline]);
        // article.textContent && tags.push(['textContent', article.textContent]);
        article.length && tags.push(['length', article.length.toString()]);

        tags.push(['r', url]);
        tags.push(['published_at', Math.floor(Date.now() / 1000).toString()]);

        const turndownService = new TurndownService();
        const content = turndownService.turndown(article.content);

        const postEvent = new NDKEvent($ndk, {
            kind: 30023,
            content,
            created_at: Math.floor(Date.now() / 1000),
            tags,
        });

        await postEvent.sign();
        console.log(await postEvent.toNostrEvent());
        await $ndk.publish(postEvent);
        console.log(postEvent.encode());

        goto(`/a/${postEvent.encode()}`);
    }
</script>

{#if !url}
    <input type="text" bind:value={_url}>
    <button on:click={() => { url = _url; loadUrl(); }}>Load</button>
{:else}
    <div class="max-w-prose text-xl mx-auto flex flex-col gap-8 my-12">
        <div class="flex flex-col gap-2">
            <label for="author" class="font-bold">
                Author npub
                <span class="font-light text-sm font-gray-500"> (optional)</span>
            </label>
            <input type="text" id="author" bind:value={authorPubkey} class="
                border-2 border-gray-300
                rounded-md
                px-4 py-2
                focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent
            " />
        </div>

        <div class=" overflow-auto" style="max-height: 50vh;">
            <Article>
                {@html article?.content}
            </Article>
        </div>

        <button
            class="bg-purple-900 text-white font-bold py-4 px-4 rounded my-4"
            on:click={publishNip28}
        >
            Publish as NIP-28
        </button>
    </div>

    <Widget />
{/if}

<script lang="ts">
    import Reader from '$lib/components/articles/reader.svelte';

    import { page } from '$app/stores';
    import ArticleInterface from '$lib/interfaces/article';
    import { onMount } from 'svelte';
    import MarkdownIt from 'markdown-it';
    import { NDKEvent } from '@nostr-dev-kit/ndk';
    import { openModal } from 'svelte-modals'
    import HighlightIntroModal from '$lib/modals/HighlightIntro.svelte';
    import { ndk } from '$lib/store';
    import { idFromNaddr } from '$lib/utils';

    const { naddr } = $page.params;
    const articleId = idFromNaddr(naddr);

    let articles: any;
    let article: App.Article;
    let content: string = '';
    let unmarkedContent: string = '';
    let articleEvent: NDKEvent;

    onMount(async () => {
        // check if the highlightintro modal has been displayed on localStorage
        if (!localStorage.getItem('highlightIntro')) {
            openModal(HighlightIntroModal);
            localStorage.setItem('highlightIntro', 'true');
        }
    });

    // Load article
    $: if (!articles) {
        articles = ArticleInterface.load({id: articleId});
    }

    $: if (!article && ($articles||[]).length > 0) {
        article = ($articles || [])[0];
        articleEvent = new NDKEvent($ndk, JSON.parse(article.event));

        const md = new MarkdownIt();
        md.linkify?.set();
        unmarkedContent = md.render(article.content);
        content = unmarkedContent;
    }
</script>

{#if article}
    <Reader
        {article}
        {content}
        {unmarkedContent}
        {articleEvent}
    />
{/if}
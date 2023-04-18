<script lang="ts">
    import Hero from '$lib/components/Hero.svelte';
    import Footer from '$lib/components/Footer.svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';

    let knowAuthorPubkey = false;
    let url: string = $page.url.searchParams.get('url') || '';
    let authorPubkey: string = $page.url.searchParams.get('author') || '';

    function load() {
        if (!url) return;

        let loadUrl = `/load?url=${encodeURIComponent(url)}`;
        if (authorPubkey) {
            loadUrl += `&author=${encodeURIComponent(authorPubkey)}`;
        }

        goto(loadUrl);
    }
</script>

<Hero />

<main class="max-w-2xl mx-auto pb-32 flex flex-col items-center gap-6">
    <div class="flex flex-row gap-4 w-full">
        <input type="text" class="
            rounded-xl
            bg-zinc-900 border-2 border-zinc-800
            w-full
            p-4
            text-2xl
            text-zinc-400
        " placeholder="Enter article URL" bind:value={url}>

        <button class="
            text-xl
            bg-gradient-to-br from-orange-400 to-red-800
            text-white
            px-6
            rounded-xl
            font-semibold
            uppercase
        " on:click={load}>Load</button>
    </div>

    {#if knowAuthorPubkey || authorPubkey}
        <input type="text" class="
            rounded-xl
            bg-zinc-900 border-2 border-zinc-800
            w-full
            px-4 p-2
            text-lg
            text-zinc-400
            font-mono
        " placeholder="npub..." bind:value={authorPubkey}>

        <button class="text-zinc-400 hover:text-white font-mono" on:click={() => { knowAuthorPubkey = false; authorPubkey = null }}>
            Cancel
        </button>
    {:else}
        <button class="text-zinc-400 hover:text-white font-mono" on:click={() => { knowAuthorPubkey = true }}>
            Know the author's pubkey?
        </button>
    {/if}
</main>

<Footer />
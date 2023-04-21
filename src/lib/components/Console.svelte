<script lang="ts">
    import { goto } from '$app/navigation';

    let knowAuthorPubkey = false;
    export let url: string | null = null;
    export let authorPubkey: string | null = null;

    function load() {
        if (!url) return;

        if (url.startsWith('naddr')) {
            goto(`/a/${encodeURIComponent(url)}`);
            return;
        } else if (url.match(/\/naddr1/i)) {
            // extract from url the naddr to the end of the string which can be of any length and remove
            // the leading slash
            try {
                let naddr = url.match(/\/naddr1.*/)![0].slice(1);

                goto(`/a/${encodeURIComponent(naddr)}`);
                return;
            } catch (e) {
            }
        }

        let loadUrl = `/load?url=${encodeURIComponent(url)}`;
        if (authorPubkey) {
            loadUrl += `&author=${encodeURIComponent(authorPubkey)}`;
        }

        goto(loadUrl);
    }
</script>

<div class="flex flex-col items-center gap-6">
    <p class="text-zinc-600 text-xl font-thin mb-4">
        Enter a NIP-23 <code>naddr</code> or a URL from
        any website (e.g. medium.com).
    </p>

    <div class="flex flex-row gap-4 w-full">
        <input type="text" class="
            rounded-xl
            bg-zinc-900 border-2 border-zinc-800
            w-full
            p-4
            text-2xl
            font-mono
            text-zinc-400
        " placeholder="naddr or URL (e.g. https://medium.com/....)" bind:value={url}>

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
</div>
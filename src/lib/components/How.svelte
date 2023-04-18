<script lang="ts">
    import CopyIcon from '$lib/icons/Copy.svelte';
    import CheckIcon from '$lib/icons/Check.svelte';

    let copied = false;

    function copyNpub() {
        navigator.clipboard.writeText('nostr:npub1w0rthyjyp2f5gful0gm2500pwyxfrx93a85289xdz0sd6hyef33sh2cu4x');
        copied = true;
        setTimeout(() => {
            copied = false;
        }, 2000);
    }
</script>

<div class="text-xl flex flex-col gap-6 leading-relaxed sm:text-justify px-6 text-zinc-400">
    There are a few different ways of interacting with Zapworthy.

    <h4 class="text-4xl text-white font-serif font-thin mt-4">
        Web
    </h4>

    <p>
        You can use the web interface to load an article and highlight directly
        from the web.
    </p>

    <a href="/web" class="
        font-semibold outline outline-1 outline-orange-500 px-4 py-3 rounded-xl text-lg self-start
        text-orange-600 hover:text-white
        hover:bg-orange-600 transition duration-300
    ">
        Web Console
    </a>

    <h4 class="text-4xl text-white font-serif font-thin mt-4">
        Browser Extension
    </h4>

    <p>
        You can install a browser extension to highlight and
        categorize the zapworthy content you randomly find.
    </p>

    <a href="#" class="
        font-semibold outline outline-1 outline-orange-500 px-4 py-3 rounded-xl text-lg self-start
        text-orange-600 hover:text-white
        hover:bg-orange-600 transition duration-300
    ">
        Chrome Extension
    </a>

    <p>
        That extension even enables you to quickly ingest a
        worthy essay right as a Nostr long-form post.
    </p>

    <h4 class="text-4xl text-white font-serif font-thin mt-4">
        @zapworthy bot
    </h4>

    <p>
        You can tag the @zapworthy bot with a URL you would like
        to be converted into a NIP-23 long-form post; so that you
        can use the embedded highlighter in this site. The bot
        will reply with a URL for you to use.
    </p>

    <div class="flex flex-row gap-4">
        <a href="nostr:npub1w0rthyjyp2f5gful0gm2500pwyxfrx93a85289xdz0sd6hyef33sh2cu4x" class="
            font-semibold outline outline-1 outline-orange-500 px-4 py-3 rounded-xl text-lg self-start
            text-orange-600 hover:text-white
            hover:bg-orange-600 transition duration-300
        ">
            @zapworthy
        </a>

        <button on:click={copyNpub}>
            {#if copied}
                <span class="text-green-500 flex flex-row gap-2 text-sm items-center"><CheckIcon /> Copied</span>
            {:else}
                <CopyIcon />
            {/if}
        </button>
    </div>

    <h4 class="text-4xl text-white font-serif font-thin mt-4">
        NIP-23 long-form content
    </h4>

    <p>
        Obviously, nostr tools prefer nostr content, yes, we
        are showing our bias here, but interoperable content
        is just better that way.
    </p>

    <p>
        If you find a NIP-23 content you can pop it right in
        using it's <code>naddr</code> and begin saving glorious treasures from it.
    </p>
</div>
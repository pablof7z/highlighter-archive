<script lang="ts">
    import { goto } from '$app/navigation';

    let knowAuthorPubkey = false;
    export let url: string | null = null;
    export let authorPubkey: string | null = null;

    function load() {
        if (!url) return;

        const midUrlEventMatcher = /\/(naddr|nevent|note)*1([a-zA-Z0-9]+)\/?$/i;

        if (
            url.startsWith('naddr1') ||
            url.startsWith('nevent1') ||
            url.startsWith('note1')
        ) {
            goto(`/a/${encodeURIComponent(url)}`);
            return;
        } else if (url.match(midUrlEventMatcher)) {
            // extract from url the naddr to the end of the string which can be of any length and remove
            // the leading slash
            try {
                let naddr = url.match(midUrlEventMatcher)![0].slice(1);

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

    function setValue(e) {
        url = e.target.attributes.href.value;

        setTimeout(load, 1000);
    }
</script>

<div class="flex flex-col items-center gap-6 w-full">
    <p class="text-zinc-800 text-2xl mb-4 font-semibold">
        Enter a URL from any website, or a nostr event's ID.
    </p>

    <div class="flex flex-row gap-4 w-full">
        <input type="text" class="
            bg-white
            rounded-lg shadow
            w-full
            p-4
            border-0
            text-xl
            font-mono
        " placeholder="naddr or URL (e.g. https://medium.com/....)" bind:value={url}>

        <button class="
            bg-primary-500 hover:bg-primary-600
            text-white font-semibold
            px-6 py-2
            transition-colors duration-200
            text-xl
            rounded-xl
            uppercase
        " on:click={load}>Load</button>
    </div>

    {#if knowAuthorPubkey || authorPubkey}
        <input type="text" class="
            rounded-xl
            bg-white
            w-full
            border-0 shadow
            px-4 p-2
            text-lg
            font-mono
        " placeholder="npub..." bind:value={authorPubkey}>

        <button class="text-zinc-400 hover:text-black font-mono" on:click={() => { knowAuthorPubkey = false; authorPubkey = null }}>
            Cancel
        </button>
    {:else}
        <button class="text-zinc-400 hover:text-black font-mono" on:click={() => { knowAuthorPubkey = true }}>
            Know the author's pubkey?
        </button>
    {/if}

    <div class="overflow-hidden rounded-lg bg-white shadow p-6 flex flex-col gap-4">
        <h3 class="text-lg font-semibold">
            Some things to try
        </h3>

        <ul class="flex flex-col gap-2 max-w-prose overflow-auto ">
            <li>
                Snort link:
                <button on:click={setValue} href="https://snort.social/e/note194n247lecqgcskk5rmmfgrapt4jx7ppq64xec0eca3s4ta3hwkrsex7pxa" class="text-orange-500">
                    https://snort.social/e/note194n247lecqgcskk5rmmfgrapt4jx7ppq64xec0eca3s4ta3hwkrsex7pxa
                </button>
            </li>

            <li>
                Kind 1 (short note) event:
                <button on:click={setValue} href="note194n247lecqgcskk5rmmfgrapt4jx7ppq64xec0eca3s4ta3hwkrsex7pxa" class="text-orange-500">
                    note194n247lecqgcskk5rmmfgrapt4jx7ppq64xec0eca3s4ta3hwkrsex7pxa
                </button>
            </li>

            <li>
                Medium Article
                <button on:click={setValue} href="https://medium.com/btc24/nostr-a-decentralised-social-platform-2651930378b9" class="text-orange-500">
                    https://medium.com/btc24/nostr-a-decentralised-social-platform-2651930378b9
                </button>
            </li>

            <li>
                Habla.news link:
                <button on:click={setValue} href="https://habla.news/a/naddr1qqxryvpjxvcrgvfsfacy2eqpzdmhxue69uhhyetvv9ujue3h0ghxjme0qy0hwumn8ghj7mn0wd68yttjv4kxz7fwdehkkmm5v9ex7tnrdakj7q3q9mduaf5569jx9xz555jcx3v06mvktvtpu0zgk47n4lcpjsz43zzqxpqqqp65w27z7wl" class="text-orange-500">
                    https://habla.news/a/naddr1qqxryvpjxvcrgvfsfacy2eqpzdmhxue69uhhyetvv9ujue3h0ghxjme0qy0hwumn8ghj7mn0wd68yttjv4kxz7fwdehkkmm5v9ex7tnrdakj7q3q9mduaf5569jx9xz555jcx3v06mvktvtpu0zgk47n4lcpjsz43zzqxpqqqp65w27z7wl
                </button>
            </li>

            <li>
                NIP-23 (long-form article) event:
                <button on:click={setValue} href="naddr1qqxryvpjxvcrgvfsfacy2eqpzdmhxue69uhhyetvv9ujue3h0ghxjme0qy0hwumn8ghj7mn0wd68yttjv4kxz7fwdehkkmm5v9ex7tnrdakj7q3q9mduaf5569jx9xz555jcx3v06mvktvtpu0zgk47n4lcpjsz43zzqxpqqqp65w27z7wl" class="text-orange-500">
                    naddr1qqxryvpjxvcrgvfsfacy2eqpzdmhxue69uhhyetvv9ujue3h0ghxjme0qy0hwumn8ghj7mn0wd68yttjv4kxz7fwdehkkmm5v9ex7tnrdakj7q3q9mduaf5569jx9xz555jcx3v06mvktvtpu0zgk47n4lcpjsz43zzqxpqqqp65w27z7wl
                </button>
            </li>
        </ul>
    </div>
</div>
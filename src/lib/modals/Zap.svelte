<script lang="ts">
    import { ndk } from '$lib/store';
    import UserCard from '$lib/components/UserCard.svelte';
    import PillButton from '$lib/components/buttons/pill.svelte';
    import CloseIcon from '$lib/icons/Close.svelte';
    import { NDKEvent, zapInvoiceFromEvent } from '@nostr-dev-kit/ndk';
    import { requestProvider } from 'webln';

    import { closeModal } from 'svelte-modals';
    import { fade } from 'svelte/transition';
    import { onMount } from 'svelte';

    export let highlight: App.Highlight;
    export let article: App.Article;

    let amount = '1000';
    let comment = '';

    async function zap() {
        await $ndk.connect();
        let zappedEvent = new NDKEvent($ndk, JSON.parse(highlight.event));
        let pr = await zappedEvent.zap(highlighterAmount*1000, comment);

        if (!pr) {
            console.log('no payment request');
            return;
        }

        try {
            const webln = await requestProvider();
            const res = await webln.sendPayment(pr);
        } catch (err: any) {
            console.log(err);
        }

        zappedEvent = new NDKEvent($ndk, JSON.parse(article.event));
        pr = await zappedEvent.zap(authorAmount*1000, comment, [['e', highlight.id]]);

        if (!pr) {
            console.log('no payment request');
            return;
        }

        try {
            const webln = await requestProvider();
            const res = await webln.sendPayment(pr);
        } catch (err: any) {
            console.log(err);
            // should we unlock the mutex here if the user rejected the payment?
        }
    }

    let authorAmount: number, publisherAmount: number, highlighterAmount: number;
    let showAuthor: boolean, showPublisher: boolean, showHighlighter: boolean;

    onMount(() => {
        if (article?.author)
            showAuthor = true;

        if (highlight?.pubkey && highlight.pubkey !== article?.author)
            showHighlighter = true;

        if (article?.publisher && article?.publisher !== article?.author)
            showPublisher = true;

        changeAmount();
    });

    function changeAmount() {
        const iAmount = parseInt(amount);

        if (showAuthor && showPublisher && showHighlighter) {
            authorAmount = iAmount * 0.7;
            publisherAmount = iAmount * 0.1;
            highlighterAmount = iAmount * 0.2;
        } else if (showAuthor && showPublisher) {
            authorAmount = iAmount * 0.9;
            publisherAmount = iAmount * 0.1;
        } else if (showAuthor && showHighlighter) {
            authorAmount = iAmount * 0.8;
            highlighterAmount = iAmount * 0.2;
        } else if (showPublisher && showHighlighter) {
            publisherAmount = iAmount * 0.6;
            highlighterAmount = iAmount * 0.4;
        } else if (showAuthor) {
            authorAmount = iAmount;
        } else if (showPublisher) {
            publisherAmount = iAmount;
        } else if (showHighlighter) {
            highlighterAmount = iAmount;
        }
    }
</script>

<div role="dialog" class="modal" transition:fade>
    <div class="
        rounded-xl p-6
        shadow-xl shadow-black
        bg-zinc-900 text-white
        flex flex-col gap-8
        relative
    " style="pointer-events: auto;">
        <button class="
            text-zinc-500 hover:text-zinc-300 transition duration-300
            absolute top-2 right-2
        " on:click={closeModal}>
            <CloseIcon />
        </button>
        <div class="flex flex-col gap-3">
            <h2 class="text-zinc-500 font-semibold text-base uppercase">SPLITS</h2>

            {#if article?.author}
                <UserCard pubkey={article.author} subtitle="AUTHOR">
                    <div slot="right-column">
                        ⚡️ {authorAmount}
                    </div>
                </UserCard>
            {/if}

            {#if article?.publisher && article?.publisher !== article?.author}
                <UserCard pubkey={article.publisher} subtitle="PUBLISHER">
                    <div slot="right-column">
                        ⚡️ {publisherAmount}
                    </div>
                </UserCard>
            {/if}

            {#if highlight && highlight.pubkey !== article?.author}
                <UserCard pubkey={highlight.pubkey} subtitle="HIGHLIGHTER">
                    <div slot="right-column">
                        ⚡️ {highlighterAmount}
                    </div>
                </UserCard>
            {/if}
        </div>

        <div class="flex flex-col gap-3">
            <h2 class="text-zinc-500 font-semibold text-base uppercase">
                AMOUNT
            </h2>

            <div class="flex flex-row">
                <PillButton bind:group={amount} on:change={changeAmount} value="1000">
                    👍 1k
                </PillButton>
                <PillButton bind:group={amount} on:change={changeAmount} value="5000">
                    💜 5k
                </PillButton>
                <PillButton bind:group={amount} on:change={changeAmount} value="10000">
                    😍 10k
                </PillButton>
                <PillButton bind:group={amount} on:change={changeAmount} value="50000">
                    🤩 50k
                </PillButton>
                <PillButton bind:group={amount} on:change={changeAmount} value="100000">
                    🤯 100k
                </PillButton>
            </div>
        </div>

        <div class="flex flex-col gap-3">
            <h2 class="text-zinc-500 font-semibold text-base uppercase">
                COMMENT
            </h2>

            <input
                type="text"
                class="borde-1 border-zinc-600 bg-zinc-800 text-zinc-400 rounded-xl p-4"
                maxlength="50"
                placeholder="Add a comment..."
                bind:value={comment} />
        </div>

        <div class="actions">
            <button class="
                bg-purple-600 hover:bg-orange-500
                transition duration-300 ease-in-out
                text-lg py-2 font-extrabold rounded-xl w-full
            " on:click={zap}>
                ZAP
            </button>
        </div>
    </div>
</div>

<style>
    .modal {
        position: fixed;
        top: 0;
        bottom: 0;
        right: 0;
        left: 0;
        display: flex;
        justify-content: center;
        align-items: center;

        /* allow click-through to backdrop */
        pointer-events: none;
    }

    .actions {
        margin-top: 32px;
        display: flex;
        justify-content: flex-end;
    }
</style>
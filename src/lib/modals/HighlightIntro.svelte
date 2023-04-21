<script lang="ts">
    import { closeModal } from 'svelte-modals';
    import CloseIcon from '$lib/icons/Close.svelte';
    import { fade } from 'svelte/transition';
</script>

<div role="dialog" class="modal" transition:fade>
    <div class="
        rounded-xl p-6
        shadow-xl shadow-black
        bg-zinc-900 text-zinc-400
        flex flex-col gap-8
        relative
        text-lg
        max-w-md
    " style="pointer-events: auto;">
        <button class="
            text-zinc-500 hover:text-zinc-300 transition duration-300
            absolute top-2 right-2
        " on:click={closeModal}>
            <CloseIcon />
        </button>
        <h2 class="text-zinc-500 font-semibold text-base uppercase">Highlights</h2>

        <p>
            Here you can highlight an article, see what others have remarked, and interact with their highlights.
        </p>

        <p>
            An article can be either a URL or, preferrably, a Nostr-native NIP-23 long-form post.
        </p>

        <div class="flex flex-row items-start gap-4">
            <img src="/images/logo.png" class="rounded-full w-12 h-12" />

            <p>
                Use the highlighting tools on the bottom-left corner.
                <span class="text-white">Click it to get started.</span>
            </p>
        </div>

        <button class="
            bg-purple-600 hover:bg-orange-500
            transition duration-300 ease-in-out
            text-white uppercase
            text-lg py-2 font-extrabold rounded-xl w-full
            mt-4
        " on:click={closeModal}>
            Ok, got it!
        </button>
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
</style>
<script lang="ts">
    // import Logo from '$lib/elements/icons/Logo.svelte';
    import PlusCircle from '$lib/icons/PlusCircle.svelte';
    import MyHighlightsIcon from '$lib/icons/MyHighlights.svelte';
    import HowIcon from '$lib/icons/How.svelte';
    import ConsoleIcon from '$lib/icons/Console.svelte';
    import { currentUser } from '$lib/store';
    import { createEventDispatcher } from 'svelte';

    import Avatar from '$lib/components/Avatar.svelte';
    import RadioButton from '$lib/components/buttons/radio.svelte';
    import Link from './Link.svelte';
  import { Tooltip } from 'flowbite-svelte';

    const dispatch = createEventDispatcher();


    function submitTrack() {
        dispatch('submitTrack');
    }

    function signIn() {
        dispatch('signIn');
    }
</script>

<div
    class="
    flex flex-row gap-4
    px-8 py-2 items-center
"
>
    <button class="
        block lg:hidden
    " on:click={() => {dispatch('toggleSidebar')}}>
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"></path>
        </svg>
    </button>

    <a href="/" class="
        text-xl sm:text-xl font-black leading-normal
        flex flex-row gap-1
        text-transparent bg-clip-text bg-gradient-to-br from-orange-500 to-red-700
    ">
        HIGHLIGHTER

    </a>

    <Link href="/"
        klass="
            text-zinc-400 hover:text-white
            transition duration-300
        "
        activeKlass="text-white"
    >
        <MyHighlightsIcon />
        <span class="hidden sm:block">Highlights</span>
    </Link>

    <Link href="/web"
        klass="
            text-zinc-400 hover:text-white
            transition duration-300
        "
        activeKlass="text-white"
    >
        <MyHighlightsIcon />
        <span class="hidden sm:block">Console</span>
    </Link>

    <Link href="/about"
        klass="
            text-zinc-400 hover:text-white
            transition duration-300
        "
        activeKlass="text-white"
    >
        <MyHighlightsIcon />
        <span class="hidden sm:block">What is this?</span>
    </Link>

    <div class="ml-auto flex flex-row gap-4 items-center">
        {#if $currentUser}
            <a
                href="/atlas"
                class="
                    bg-orange-600
                    rounded-full
                    font-semibold
                    px-4 py-1.5 h-10
                    text-white
                    flex flex-row gap-2
                    items-center
                "
                on:click={submitTrack}
            >
                <PlusCircle />
                Atlas Notes
            </a>
            <Avatar
                pubkey={$currentUser?.hexpubkey()}
                klass="w-10 h-10 border-2 border-slate-200"
            />
        {:else}
            <button
                class="
                    bg-button-purple
                    rounded-full
                    font-semibold
                    px-4 py-1.5 h-10
                    text-white
                    flex flex-row gap-2
                    items-center
                "
                on:click={signIn}
            >
                Sign in
            </button>
        {/if}
    </div>
</div>

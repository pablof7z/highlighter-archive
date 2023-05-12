<script lang="ts">
    import PlusCircle from '$lib/icons/PlusCircle.svelte';
    import MyHighlightsIcon from '$lib/icons/MyHighlights.svelte';
    import ConsoleIcon from '$lib/icons/Console.svelte';
    import AboutIcon from '$lib/icons/About.svelte';
    import { currentUser, currentScope } from '$lib/store';
    import { createEventDispatcher } from 'svelte';

    import Avatar from '$lib/components/Avatar.svelte';
    import Link from './Link.svelte';
  import Logo from '$lib/icons/Logo.svelte';

    const dispatch = createEventDispatcher();


    function submitTrack() {
        dispatch('submitTrack');
    }

    function signIn() {
        dispatch('signIn');
    }
</script>

<nav class="border-b border-gray-200 bg-white">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex h-16 justify-between">
        <div class="flex">
            <div class="flex flex-shrink-0 items-center">
                <Logo />
            </div>
            <div class="hidden sm:-my-px sm:ml-6 sm:flex sm:space-x-8">
                <!-- Current: "border-slate-500 text-gray-900", Default: "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700" -->
                <Link href="/{$currentScope?.label}/highlights"
                    klass="
                        border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium
                    "
                    activeKlass="
                        hover:border-gray-300 hover:text-gray-700 inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium
                        border-slate-500 text-gray-900
                    "
                >
                    <MyHighlightsIcon />
                    <span class="hidden sm:block">Highlights</span>
                </Link>

                <Link href="/web"
                    klass="
                        border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium
                    "
                    activeKlass="
                        hover:border-gray-300 hover:text-gray-700 inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium
                        border-slate-500 text-gray-900
                    "
                >
                    <ConsoleIcon />
                    <span class="hidden sm:block">Search</span>
                </Link>

                <Link href="/about"
                    klass="
                        border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium
                    "
                    activeKlass="
                        hover:border-gray-300 hover:text-gray-700 inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium
                        border-slate-500 text-gray-900
                    "
                >
                    <AboutIcon />
                    <span class="hidden sm:block">About</span>
                </Link>
            </div>
        </div>
        <div class="hidden sm:ml-6 sm:flex sm:items-center">
            <!-- Profile dropdown -->
            <div class="relative ml-3">
                <div class="flex flex-row gap-4 items-center">
                    {#if $currentUser}
                        <a
                            href="/atlas"
                            class="
                                ring-1
                                ring-zinc-500
                                rounded-full
                                font-semibold
                                px-4 py-1.5 h-10
                                text-zinc-500
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
        </div>
        <div class="-mr-2 flex items-center sm:hidden">
          <!-- Mobile menu button -->
          <button type="button" class="inline-flex items-center justify-center rounded-md bg-white p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2" aria-controls="mobile-menu" aria-expanded="false">
            <span class="sr-only">Open main menu</span>
            <!-- Menu open: "hidden", Menu closed: "block" -->
            <svg class="block h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            <!-- Menu open: "block", Menu closed: "hidden" -->
            <svg class="hidden h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile menu, show/hide based on menu state. -->
    <div class="sm:hidden" id="mobile-menu">
        <div class="space-y-1 pb-3 pt-2">
            <!-- Current: "border-slate-500 bg-slate-50 text-slate-700", Default: "border-transparent text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800" -->
            <a href="/" class="border-slate-500 bg-slate-50 text-slate-700 block border-l-4 py-2 pl-3 pr-4 text-base font-medium" aria-current="page">Highlights</a>
        </div>
    </div>
  </nav>

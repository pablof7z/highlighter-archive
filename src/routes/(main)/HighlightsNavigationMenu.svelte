<script lang="ts">
    import MyHighlightsIcon from '$lib/icons/MyHighlights.svelte';
    import GlobalIcon from '$lib/icons/Global.svelte';
    import FollowsIcon from '$lib/icons/Follows.svelte';

    import { Tooltip } from 'flowbite-svelte';

    import Link from './components/Link.svelte';
</script>

<div class="
    flex flex-row text-slate-300 items-center justify-center mb-4 sm:mb-12 sm:gap-4
    whitespace-nowrap
">
    <Link
        href="/my"
        klass="
            text-zinc-300 hover:text-white
            transition duration-300
            pb-2
        "
        activeKlass="text-white font-bold border-b-2 border-white pb-2"
    >
        <MyHighlightsIcon />
        <span class="hidden sm:block">Personal</span>
    </Link>
    <Tooltip>Your personal highlights</Tooltip>

    <Link
        href="/"
        klass="
            text-zinc-300 hover:text-white
            transition duration-300
            pb-2
        "
        activeKlass="text-white font-bold border-b-2 border-white pb-2"
    >
        <FollowsIcon />
        <span class="hidden sm:block">Your Network</span>
    </Link>
    <Tooltip>Highlights from the people you follow</Tooltip>

    <Link
        href="/global"
        klass="
            text-zinc-300 hover:text-white
            transition duration-300
            pb-2
        "
        activeKlass="text-white font-bold border-b-2 border-white pb-2"
    >
        <GlobalIcon />
        <span class="hidden sm:block">Global</span>
    </Link>
    <Tooltip>Global Feed</Tooltip>
</div>
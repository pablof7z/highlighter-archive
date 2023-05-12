<script lang="ts">
    import FullLogo from "$lib/icons/FullLogo.svelte";
    import RoundedButton from './components/RoundedButton.svelte';
</script>

<div class="mx-auto max-w-5xl sm:px-6 lg:px-8">
    <header class="py-4">
        <div class="flex flex-row items-center justify-between">
            <div class="flex flex-row items-center">
                <FullLogo />
            </div>
            <div class="flex flex-row items-center">
                <RoundedButton href="/network/highlights">Get Started</RoundedButton>
            </div>
        </div>
    </header>

    <section class="
        flex flex-row items-center
        py-10
    ">
        <div class="w-7/12 flex flex-col gap-10">
            <h1 class="text-4xl font-bold">
                Discover and share
                <mark>curated</mark>
                insights by people you trust
            </h1>

            <div class="text-xl font-light">
                Highlight, share, discover, comment and earn on any text via the nostr network. Books, articles, tweets, anything!
            </div>

            <div>
                <RoundedButton href="/network/highlights">Start Highlighting</RoundedButton>
            </div>
        </div>


    </section>
</div>

<style>
    :global(html) {
        background: #ffffff;
    }
</style>
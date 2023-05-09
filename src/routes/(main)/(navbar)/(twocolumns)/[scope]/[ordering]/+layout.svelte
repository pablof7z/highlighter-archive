<script lang="ts">
    import { page } from '$app/stores';
    import ScopeDropdown from '../../../../components/ScopeDropdown.svelte';

    let {scope, ordering } = $page.params;

    $: {
        scope = $page.params.scope;
        ordering = $page.params.ordering;
    }
</script>

<div class="flex flex-row justify-between">
    <nav class="flex space-x-4" aria-label="Tabs">
        <!-- Current: "bg-zinc-100 text-zinc-700", Default: "text-zinc-500 hover:text-zinc-700" -->
        <a href="/{scope}/newest" class="
            text-zinc-500 hover:text-zinc-700 rounded-md px-3 py-2 text-sm font-medium
            {$page.url.pathname === `/${scope}/newest` ? 'bg-beige-150 text-zinc-800' : ''}
        ">
            Newest
        </a>
        <a href="/{scope}/highlights" class="
            text-zinc-500 hover:text-zinc-700 rounded-md px-3 py-2 text-sm font-medium
            {$page.url.pathname === `/${scope}/highlights` ? 'bg-beige-150 text-zinc-800' : ''}
        ">
            Most Highlighted
        </a>
        <a href="#" on:click|preventDefault={()=>{}} class="
            text-zinc-400 cursor-default hsover:text-zinc-700 rounded-md px-3 py-2 text-sm font-medium
        ">
            Most Discussed
        </a>
        <a href="/network/highlights" on:click|preventDefault={()=>{}} class="
            text-zinc-400 cursor-default hsover:text-zinc-700 rounded-md px-3 py-2 text-sm font-medium
        ">
            Most Zapped
        </a>
    </nav>

    <ScopeDropdown bind:scope urlTemplate="/<scope>/{ordering}" />
</div>

<section>
    <slot />
    <!-- <div class="overflow-hidden rounded-lg bg-white shadow">
        <div class="p-6">
            <slot />
        </div>
    </div> -->
</section>
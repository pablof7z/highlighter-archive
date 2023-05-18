<script lang="ts">
    import Name from '$lib/components/Name.svelte';

    import ChevronDownIcon from '$lib/icons/ChevronDown.svelte';
    import { currentUser } from '$lib/store';

    import { Button, Dropdown, DropdownItem, Chevron, Radio, Helper} from 'flowbite-svelte'

    export let delegatedName: string | undefined = undefined;
    export let value: string;
</script>

<button class="
    px-3 py-2
    text-sm
    font-semibold
    flex flex-row items-center gap-2
">
    <div class="font-normal">
        Publishing as
        {#if value === 'Public'}
            <Name pubkey={$currentUser?.hexpubkey()} />
        {:else if value === 'Delegated'}
            Public (as {delegatedName})
        {:else if value === 'Secret'}
            Secret
        {:else}
            {value}
        {/if}
    </div>
    <div class="w-4 h-4"><ChevronDownIcon /></div>
</button>
<Dropdown class="w-96 space-y-1 rounded-xl shadow-lg z-50" placement="right-start">
    <li class="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-600">
        <Radio bind:group={value} value='Public'>Public (as <Name pubkey={$currentUser.hexpubkey()} />)</Radio>
        <Helper class="pl-6">This will be a <em>kind-1</em> note that will appear on your timeline; other will be able to zap it and comment on it</Helper>
    </li>
    {#if delegatedName}
        <li class="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-600">
            <Radio bind:group={value} value='Delegated'>Public (as {delegatedName})</Radio>
            <Helper class="pl-6">This will be a <em>kind-1</em> note, but will note appear on your timeline; you'll be able to share it and others could comment on it</Helper>
        </li>
    {/if}
    <li class="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-600">
        <Radio bind:group={value} value='Secret'>Secret</Radio>
        <Helper class="pl-6">This note will be encrypted so what you write cannot be seen by anyone</Helper>
    </li>
</Dropdown>

<style>
    :global(input[type="radio"]) {
        margin-right: 0.5rem;
    }
</style>
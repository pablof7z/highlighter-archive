<script lang="ts">
    export let value: string;

    let addComment = false;
</script>

{#if !addComment}
    <button class="text-base text-zinc-400 text-left" on:click={() => {addComment = true}}>
        Click to add some thoughts
    </button>
{:else}
    <div class="relative">
        <textarea rows="5" autofocus class="
            rounded-lg shadow
            block w-full resize-none border-1 border-zinc-200 bg-transparent py-1.5
            text-gray-600 placeholder:text-gray-400 focus:ring-0 sm:leading-6
        " bind:value
        placeholder="Your thoughts"></textarea>
        <button class="
            absolute bottom-1 left-2 text-xs text-gray-400 text-left p-0
        " on:click={()=>{addComment = false;}}>cancel</button>
    </div>
{/if}
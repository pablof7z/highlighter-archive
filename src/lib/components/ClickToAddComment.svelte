<script lang="ts">
    export let value: string;
    export let show = false;
</script>

{#if !show}
    <button class="text-base text-orange-500 text-left" on:click={() => {show = true}}>
        Click to add your thoughts
    </button>
{:else}
    <div class="relative">
        <textarea rows="5" autofocus class="
            rounded-lg shadow
            bg-white
            block w-full resize-none border-1 border-zinc-200 bg-transparent py-1.5
            text-gray-600 placeholder:text-gray-400 focus:ring-0 sm:leading-6
        " bind:value
        placeholder="Your thoughts"></textarea>
        <button class="
            absolute bottom-1 left-2 text-xs text-gray-400 text-left p-0
        " on:click={()=>{show = false;}}>cancel</button>
    </div>
{/if}
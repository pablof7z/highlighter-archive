<script lang="ts">
    import { onMount } from "svelte";
    import { createEventDispatcher } from 'svelte';
    import { getText, getParagraph, getSentence } from 'get-selection-more'


    export let selection: string | undefined = undefined;

    let wrapperEl: HTMLDivElement;
    const dispatch = createEventDispatcher();

    onMount(() => {
        // when wrapperEl is selected
        document.addEventListener("selectionchange", () => {
            // get the selection
            const sel = window.getSelection();
            var selectedRange = sel.getRangeAt(0);
            // get the text content of the selection
            selection = sel.toString();
            if (wrapperEl.contains(selectedRange.commonAncestorContainer)) {
                const d = {
                    selection: getText(),
                    paragraph: getParagraph(),
                    sentence: getSentence(),
                }
                dispatch('selectionchange', d);
            }
        });
    })
</script>

<div bind:this={wrapperEl} on:selectionchange>
    <slot />
</div>

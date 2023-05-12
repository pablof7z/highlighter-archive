<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { createEventDispatcher } from 'svelte';
    import { getText, getParagraph, getSentence } from 'get-selection-more'


    export let selection: string | undefined = undefined;

    let wrapperEl: HTMLDivElement;
    const dispatch = createEventDispatcher();

    let listener: any;

    onMount(() => {
        listener = () => {
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
        }

        // when wrapperEl is selected
        document.addEventListener("selectionchange", listener);
    })

    onDestroy(() => {
        if (listener) {
            document.removeEventListener("selectionchange", listener);
        }
    })
</script>

<div bind:this={wrapperEl} on:selectionchange>
    <slot />
</div>

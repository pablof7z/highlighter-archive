<script lang="ts">
    export let highlight: App.Highlight;
    let prevHighlightContent: string;

    let contextWithHighlight = '';

    $: if (highlight.content !== prevHighlightContent) {
        prevHighlightContent = highlight.content;

        if (highlight.context) {
            contextWithHighlight = highlight.context.replace(highlight.content, `<mark>${highlight.content}</mark>`);
        } else {
            contextWithHighlight = `<mark>${highlight.content}</mark>`;
        }
    }
</script>

{@html contextWithHighlight}
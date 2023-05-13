<script lang="ts">
    import ndk from '$lib/stores/ndk';

    import EventCard from '$lib/components/events/card.svelte';

    import { NDKEvent } from '@nostr-dev-kit/ndk';
    import { onMount } from 'svelte';
    import NoteInterface from '$lib/interfaces/notes';

    export let note: App.Note;
    export let highlight: App.Note | App.Highlight;
    export let event: NDKEvent | undefined = undefined;
    export let skipButtons = false;

    if (!event) event = new NDKEvent($ndk, JSON.parse(note.event));

    let replies;
    let noteQuery;

    onMount(() => {
        if (note.id) {
            // send null so a kind won't be autoset to 1
            noteQuery = NoteInterface.load({ ids: [note.id], kind: null });
            replies = NoteInterface.load({ replies: [note.id] });
        }
    });
</script>

<EventCard
    {note}
    {highlight}
    {event}
    skipHeader={true}
    {skipButtons}
    replies={($replies||[])}
    expandReplies={true}
>
</EventCard>
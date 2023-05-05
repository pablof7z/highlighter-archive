<script lang="ts">
    import Name from '$lib/components/Name.svelte';
    import Note from '$lib/components/Note.svelte';
    import { parseContent } from '$lib/nip27';
    import type { NDKTag } from '@nostr-dev-kit/ndk/lib/src/events';
    export let title: string | undefined = undefined;
    export let note: string;
    export let tags: NDKTag[] = [];
    let notePrev: string;

    const links = []
    const entities = []
    const ranges = []

    let anchorId;
    let content;

    $: if (note && note !== notePrev) {
        notePrev = note;

        content = parseContent(note, tags);

        // Find links and preceding whitespace
        for (let i = 0; i < content.length; i++) {
            const {type, value} = content[i]

            if (
                (type === "link" && !value.startsWith("ws")) ||
                ["nostr:note", "nostr:nevent"].includes(type)
            ) {
                if (type === "link") {
                    links.push(value)
                } else if (value.id !== anchorId) {
                    entities.push({type, value})
                }

                const prev = content[i - 1]
                const next = content[i + 1]

                if ((!prev || prev.type === "newline") && (!next || next.type === "newline")) {
                let n = 1
                for (let j = i - 1; ; j--) {
                    if (content[j]?.type === "newline") {
                    n += 1
                    } else {
                    break
                    }
                }

                ranges.push({i: i + 1, n})
            }
        }
    }
}
</script>

<div>
    {#each (content||[]) as { type, value }}
        {#if type === "newline"}
            {#each value as _}
                <br />
            {/each}
        {:else if type === "link"}
            {#if value.match(/(.jpg|.png|.gif)$/i)}
                <div class="max-h-64 overflow-auto">
                    <img src="{value}" />
                </div>
            {:else}
                {value.replace(/https?:\/\/(www\.)?/, "")}
            {/if}
        {:else if type.startsWith("nostr:")}
            {#if value.pubkey || value.entity.startsWith('npub')}
                <span class="text-purple-600">
                    <Name pubkey={value.id} />
                </span>
            {:else if value.entity.startsWith('nevent')}
                <Note noteId={value.id} />
            {/if}
        {:else if type === "topic"}
            <b>#{value}</b>

        {:else}
            {value}
        {/if}
    {/each}
</div>
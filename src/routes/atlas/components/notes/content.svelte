<script lang="ts">
    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import { parseContent } from '$lib/nip27';
    export let title: string | undefined = undefined;
    export let note: string;
    export let tags: any[];
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

<div class="
    leading-relaxed
    h-full flex flex-col sm:text-justify
    text-black
    overflow-auto
">
    {#if title}
        <div class="text-sm text-gray-500">
            {title}
        </div>
    {/if}

    <div>
        {#each content as { type, value }}
            {#if type === "newline"}
                {#each value as _}
                    <br />
                {/each}
            {:else if type === "link"}
                <!-- {value.replace(/https?:\/\/(www\.)?/, "")} -->
                <!-- <img src="{value}" /> -->
            {:else if type.startsWith("nostr:")}
                {#if value.pubkey || value.entity.startsWith('npub')}
                    <span class="text-purple-600">
                        <Name pubkey={value.id} />
                    </span>
                {:else}
                    «{value.entity}»
                {/if}
            {:else if type === "topic"}
                <b>#{value}</b>

            {:else}
                {value}
            {/if}
        {/each}
    </div>
</div>


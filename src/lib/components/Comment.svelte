<script lang="ts">
    import { ndk } from '$lib/store';
    import {NDKEvent} from '@nostr-dev-kit/ndk';
    import type { NostrEvent } from '@nostr-dev-kit/ndk/lib/src/events';
    import {createEventDispatcher} from 'svelte';

    const dispatch = createEventDispatcher();

    export let op: NDKEvent;
    let content: string;

    async function post() {
        const aTag = op.getMatchingTags('a')[0];
        const pTags = op.getMatchingTags('p')||[];
        const tags = [
            ['p', op.pubkey],
            ['e', op.id],
            ...pTags
        ]

        if (aTag) tags.push(aTag);

        const event = new NDKEvent($ndk, {
            kind: 1,
            content,
            created_at: Math.floor(Date.now() / 1000),
            tags
        } as NostrEvent);
        await event.sign();
        console.log(await event.toNostrEvent());

        await event.publish();

        content = '';

        dispatch("commented", event);
    }
</script>

<div class="flex items-start space-x-4 w-full">
    <div class="min-w-0 flex-1 relative">
            <div class="overflow-hidden rounded-b-lg shadow-sm ring-1 ring-inset ring-zinc-800 focus-within:ring-2 focus-within:ring-orange-900">
                <textarea rows="3" class="block w-full resize-none border-0 bg-transparent py-1.5
                text-gray-600
                placeholder:text-gray-400 focus:ring-0 sm:text-sm sm:leading-6" placeholder="Add your comment..." bind:value={content}></textarea>

                    <!-- Spacer element to match the height of the toolbar -->
                    <div class="py-2" aria-hidden="true">
                        <!-- Matches height of button in toolbar (1px border + 36px content height) -->
                        <div class="py-px">
                            <div class="h-9"></div>
                        </div>
                    </div>
            </div>

            <div class="absolute inset-x-0 bottom-0 flex justify-between py-2 pl-3 pr-2">
            <div>
                <button
                    class="inline-flex items-center rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                    on:click|preventDefault={post}
                >
                    Post
                </button>
            </div>
            </div>
    </div>
</div>

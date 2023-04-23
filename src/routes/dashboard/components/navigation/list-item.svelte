<script lang="ts">
    import { ndk, currentUser } from '$lib/store';
    import { NDKEvent, type NDKUser } from '@nostr-dev-kit/ndk';

    import NavigationButton from './Button.svelte';

    import { onMount } from 'svelte';

    export let list: App.BookmarkList;

    let hover = false;

    async function addToList(e: DragEvent) {
        const id = e.dataTransfer.getData('id');
        const tag = JSON.parse(e.dataTransfer.getData('tag'));
        const event = new NDKEvent($ndk, JSON.parse(list.event));

        if (event.tags.find(t => t[1] === id)) {
            alert('already has it');
            return;
        }

        event.created_at = Math.floor(Date.now() / 1000);
        event.tags.push(tag);
        event.publish();
    }
</script>

<li
    on:dragenter={() => hover = true}
    on:dragleave={() => hover = false}
    on:drop={e => {addToList(e); hover = false;}}
    ondragover="return false"
    class="
        {hover ? 'bg-gray-100' : ''}
    "
>
    <NavigationButton route="/dashboard/bookmarks/{list.naddr}">
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[0.625rem] font-medium bg-white text-gray-400 border-gray-200 group-hover:border-indigo-600 group-hover:text-indigo-600">{list.title.slice(0,1)}</span>
            <span class="truncate">{list.title}</span>
    </NavigationButton>
</li>

<script lang="ts">
    import ndk from "$lib/stores/ndk";
    import NoteVisibility from './note/visibility.svelte';

    import { createEventDispatcher } from 'svelte';
    import { NDKEvent, NDKPrivateKeySigner, NDKUser } from '@nostr-dev-kit/ndk';
    import type { NDKTag, NostrEvent } from '@nostr-dev-kit/ndk/lib/src/events';
    import type { NDKSigner } from '@nostr-dev-kit/ndk/lib/src/signers';
    const dispatch = createEventDispatcher();

    export let title: string;
    export let body: string = '';
    export let visibility: string;
    export let expandEditor = false;
    export let delegatedSigner: NDKPrivateKeySigner;
    export let delegatedName: string;

    let bodyEl: HTMLTextAreaElement;
    let titleEl: HTMLInputElement;

    function titleKeyPress(e: KeyboardEvent) {
        // if key is cmd+enter call save
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            save();
            e.preventDefault();
        } else if (e.key === 'Enter') {
            expandEditor = true;
            e.preventDefault();
            e.target?.blur();
            setTimeout(() => bodyEl.focus());
        } else if (title.length > 20) {
            expandEditor = true;
        }
    }

    function bodyKeyPress(e: KeyboardEvent) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            save();
            e.preventDefault();
        }
    }

    async function saveNote(authorSigner: NDKSigner, kind: number, encrypt: boolean) {
        const author: NDKUser = await authorSigner.user();
        const tags: NDKTag[] = [];
        let content;
        body = (body||'').trim();

        encrypt && tags.push(['p', author.hexpubkey()]);
        tags.push(['client', 'atlas']);

        if (title && body.trim().length > 0) {
            let _title: string = title;
            if (encrypt) {
                _title = await authorSigner.encrypt(author, title)!;

                if (!_title) {
                    alert('encryption failed');
                    return;
                }
            }

            tags.push(['subject', _title]);
            content = body.trim();
        } else {
            content = title || '';
            content += body||'';
        }

        const event = new NDKEvent($ndk, {
            kind,
            content,
            tags,
            pubkey: author.hexpubkey(),
        } as NostrEvent);
        encrypt && await event.encrypt(author, authorSigner);
        await event.sign(authorSigner);
        await event.publish();

        return event;
    }

    async function save() {
        let e;

        switch (visibility) {
            case 'Public': e = await saveNote($ndk.signer!, 1, false); break;
            case 'Secret': e = await saveNote($ndk.signer!, 4, true); break;
            case 'Delegated': e = await saveNote(delegatedSigner, 1, false); break;
        }

        if (e) {
            dispatch('saved', { event: e, visibility });
        }
    }
</script>

<div class="relative w-full">
    <div class="overflow-hidden rounded-lg border border-gray-300 shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
        <label for="title" class="sr-only">Title</label>
        <input type="text" name="title" id="title" class="
            block w-full border-0 pt-2.5 text-xl font-medium placeholder:text-gray-400 focus:ring-0
            pb-4
        " placeholder="Title" autofocus
            bind:value={title}
            bind:this={titleEl}
            on:keydown={titleKeyPress}
            on:keyup
        >
        <label for="description" class="sr-only">Description</label>

        {#if expandEditor}
            <textarea rows="6" class="
                block w-full resize-none border-0 py-0 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm sm:leading-6
            " placeholder="..."
                bind:value={body}
                bind:this={bodyEl}
                on:keydown={bodyKeyPress}
            ></textarea>
        {/if}
    </div>

    <div class="
        absolute flex flex-row justify-between
        transition-opacity duration-200
        bottom-2
        px-2
        {expandEditor ? 'w-full' : 'right-2'}
    ">
        {#if expandEditor}
            <div class="flex flex-row items-center gap-4">
                <NoteVisibility bind:value={visibility} {delegatedName} />
            </div>
        {/if}

        <button
            class="inline-flex items-center gap-x-2 rounded-md bg-gradient-to-br from-orange-500 to-red-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-orange-600 hover:to-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500
            px-4
        " on:click={save}>
            Save
        </button>
    </div>
</div>

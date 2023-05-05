<script lang="ts">
    import EncryptedNoteInterface from '$lib/interfaces/encrypted-notes';

    import 'bytemd/dist/index.css';
    import NewIcon from '$lib/icons/New.svelte';

    import ToolbarButton from '../components/toolbar/button.svelte';


    import { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
    import { ndk, currentUser } from '$lib/store';
    import type { NostrEvent } from '@nostr-dev-kit/ndk/lib/src/events';
    import { onMount } from 'svelte';
  import { generateEphemeralSigner, saveEphemeralSigner } from '$lib/signers/ephemeral';

    let key;
    let privateNote, privateEvent;

    async function newNote() {
        const title = await prompt('Title?');

        const signer = await generateEphemeralSigner();

        // generate root event with new key
        privateNote = new NDKEvent($ndk, {
            kind: 31013,
            content: ""
        } as NostrEvent);
        privateEvent = await privateNote.toNostrEvent();
        await saveEphemeralSigner($ndk, $ndk.signer!, signer, { metadata: { title } });
    }

    let encryptedNotes: any;
    let decryptedNotes: Record<string, NDKEvent> = {};

    $: {
        if (!encryptedNotes && $currentUser) {
            encryptedNotes = EncryptedNoteInterface.load({ recipient: $currentUser!.hexpubkey() });
        }

        if ($encryptedNotes && $encryptedNotes.length > 0) {
            $encryptedNotes.forEach(async (note: App.EncryptedNote) => {
                if (note.isAtlasMessage) {
                    if (!decryptedNotes[note.id]) {
                        const eventJSON = JSON.parse(note.event);
                        const event = new NDKEvent($ndk, eventJSON);
                        await event.decrypt($currentUser!);
                        event.content = JSON.parse(event.content);

                        if (!event.content.title) return;

                        decryptedNotes[note.id] = event;

                    }
                }
            });

            decryptedNotes = decryptedNotes;
        }
    }
</script>

<div class="flex flex-row justify-end">
    <ToolbarButton on:click={newNote}>
        <NewIcon />
        Create new
    </ToolbarButton>
</div>

<div class="grid grid-flow-row md:grid-cols-4 xl:sdgrid-cols-4 gap-4">
    {#each Object.values(decryptedNotes) as note}
        <a href="/atlas/notes/{note.content.naddr}" class="flex flex-col">
            <div class="
                shadow
                flex flex-col h-full gap-4
                border border-zinc-200 hover:border-zinc-200
                px-6 pt-6 pb-4 rounded-xl
                bg-white hover:bg-slate-50 transition duration-200 ease-in-out
            " style="max-height: 40rem;">
                <div class="flex-1 truncate px-4 py-2 text-sm">
                    <div class="text-lg font-medium text-gray-900 hover:text-gray-600">
                        {note.content.title}
                    </div>
                    <div class="flex flex-row gap-4 items-start text-sm text-zinc-400">
                        {new Date(note.created_at*1000).toLocaleString()}
                    </div>
                </div>
            </div>
        </a>
    {/each}
</div>

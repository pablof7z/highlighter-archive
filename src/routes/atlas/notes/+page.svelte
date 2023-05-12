<script lang="ts">
    import EncryptedNoteInterface from '$lib/interfaces/encrypted-notes';

    import NewIcon from '$lib/icons/New.svelte';

    import ToolbarButton from '../components/toolbar/button.svelte';
    import SecretNodeEditor from '../components/secret-notes/editor.svelte';

    import { NDKEvent } from '@nostr-dev-kit/ndk';
    import { ndk, currentUser } from '$lib/store';
    import type { NostrEvent } from '@nostr-dev-kit/ndk/lib/src/events';
    import { generateEphemeralSigner, saveEphemeralSigner } from '$lib/signers/ephemeral';

    let key;
    let privateNote, privateEvent;

    async function newNote() {
        const title = await prompt('Title?');

        if (!title) return;

        const signer = await generateEphemeralSigner();
        const signerUser = await signer.user();

        const encryptedTitle = await signer.encrypt(signerUser, title);

        // generate root event with new key
        privateNote = new NDKEvent($ndk, {
            kind: 30023,
            content: "",
            tags: [
                ["subject", encryptedTitle],
            ],
            pubkey: signerUser.hexpubkey(),
        } as NostrEvent);
        console.log('debug', { privateNote });
        await privateNote.sign(signer);
        await saveEphemeralSigner($ndk, signer, {
            associatedEvent: privateNote,
            metadata: { title },
            mainSigner: $ndk.signer!
        });

        await privateNote.publish();
    }

    let encryptedNotes: any;
    let decryptedNotes: Record<string, NDKEvent | null> = {};

    $: {
        if (!encryptedNotes && $currentUser) {
            encryptedNotes = EncryptedNoteInterface.load({ recipient: $currentUser!.hexpubkey() });
        }

        if ($encryptedNotes && $encryptedNotes.length > 0 && Object.keys(decryptedNotes).length < $encryptedNotes.length) {
            setTimeout(async () => {
                for (const note of $encryptedNotes) {
                    if (note.isAtlasMessage) {
                        if (!decryptedNotes[note.id]) {
                            const eventJSON = JSON.parse(note.event);
                            const event = new NDKEvent($ndk, eventJSON);
                            await event.decrypt($currentUser!);
                            event.content = JSON.parse(event.content);

                            decryptedNotes[note.id] = event;

                        }
                    } else {
                        decryptedNotes[note.id] = null;
                    }
                }

                decryptedNotes = decryptedNotes;
            }, 100);
        }
    }

    let loadedNote: NDKEvent | null = null;
</script>

<div class="flex flex-row justify-end">
    <ToolbarButton on:click={newNote}>
        <NewIcon />
        Create new
    </ToolbarButton>
</div>

{#if loadedNote}
    <SecretNodeEditor event={loadedNote} />
{:else}
    <div class="grid grid-flow-row md:grid-cols-4 xl:sdgrid-cols-4 gap-4">
        {#each Object.values(decryptedNotes).filter(n => !!n) as note}
            <a
                href="/atlas/notes/{note.content.event||note.content.naddr}"
                class="flex flex-col"
                on:click|preventDefault={() => loadedNote = note}
            >
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
{/if}
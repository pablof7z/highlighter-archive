import { get as getStore } from 'svelte/store';
import ndkStore from '../stores/ndk';
import { liveQuery } from 'dexie';
import { db } from '$lib/interfaces/db';
import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import {nip19} from 'nostr-tools';

function valueFromTag(event: NDKEvent, tag: string): string | undefined {
    const matchingTag = event.tags.find((t: string[]) => t[0] === tag);

    if (matchingTag) return matchingTag[1];
}

interface ILoadOpts {
    recipient?: string;
};

const EncryptedNoteInterface = {
    fromCacheRepliesTo: (eventId: string) => {
        return liveQuery(() =>
            db.notes.where({replyToEventId: eventId}).toArray()
        );
    },

    fromIds: (ids: string[]) => {
        return liveQuery(() =>
            db.notes.where('id').anyOf(ids).toArray()
        );
    },

    load: (opts: ILoadOpts = {}) => {
        const filter: NDKFilter = { kinds: [4] };
        if (opts.recipient) {
            filter['authors'] = [opts.recipient];
            filter['#p'] = [opts.recipient];
        }
        console.log(filter);

        const ndk: NDK = getStore(ndkStore);

        const subs = ndk.subscribe(filter, { closeOnEose: false, groupableDelay: 500 });

        subs.on('event', async (event: NDKEvent) => {
            console.log('got event', event);
            try {
                const isAtlasMessage = valueFromTag(event, 'client') === 'atlas';

                const note: App.EncryptedNote = {
                    id: event.tagId(),
                    pubkey: event.pubkey,
                    encryptedContent: event.content,
                    isAtlasMessage,
                    event: JSON.stringify(await event.toNostrEvent())
                };

                await db.encryptedNotes.put(note);
            } catch (e) {
                console.error(e);
            }
        });

        if (opts.recipient) {
            return liveQuery(() =>
                db.encryptedNotes.where({pubkey: opts.recipient}).toArray()
            );
        }
    }
};

export default EncryptedNoteInterface;

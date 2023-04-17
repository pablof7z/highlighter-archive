import { get as getStore } from 'svelte/store';
import {ndk as ndkStore} from '../store';
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
    pubkeys?: string[];
    articleNaddr?: string;
    replies?: string[];
};

const NoteInterface = {
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
        const filter: NDKFilter = { kinds: [1] };
        if (opts.pubkeys) filter['authors'] = opts.pubkeys;
        if (opts.replies) filter['#e'] = opts.replies;

        let articleReference: string | undefined;

        if (opts.articleNaddr) {
            const ndecode = nip19.decode(opts.articleNaddr).data as any;
            articleReference = `${ndecode.kind}:${ndecode.pubkey}:${ndecode.identifier}`
            filter['#a'] = [articleReference];
        }

        const ndk: NDK = getStore(ndkStore);

        const subs = ndk.subscribe(filter, { closeOnEose: false, groupableDelay: 500 });

        subs.on('event', async (event: NDKEvent) => {
            try {
                const articleId = valueFromTag(event, 'a');
                const eventId = valueFromTag(event, 'e');

                const note: App.Note = {
                    id: event.tagId(),
                    pubkey: event.pubkey,
                    content: event.content,
                    replyToArticleId: articleId,
                    replyToEventId: eventId,
                    event: JSON.stringify(await event.toNostrEvent())
                };

                await db.notes.put(note);
            } catch (e) {
                console.error(e);
            }
        });

        if (opts.pubkeys) {
            return liveQuery(() =>
                db.notes.where('pubkey').anyOf(opts.pubkeys as string[]).toArray()
            );
        } else if (articleReference) {
            return liveQuery(() =>
                db.notes.where({replyToArticleId: articleReference}).toArray()
            );
        } else if (opts.replies) {
            return liveQuery(() =>
                db.notes.where('replyToEventId').anyOf(opts.replies!).toArray()
            );
        } else {
            return liveQuery(() => (db.notes.toArray()));
        }
    }
};

export default NoteInterface;

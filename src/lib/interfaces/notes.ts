import { get, get as getStore } from 'svelte/store';
import {ndk as ndkStore} from '../store';
import {currentUser as currentUserStore} from '../store';
import { liveQuery } from 'dexie';
import { db } from '$lib/interfaces/db';
import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKFilter, NDKUser } from '@nostr-dev-kit/ndk';
import {nip19} from 'nostr-tools';

function valueFromTag(event: NDKEvent, tag: string): string | undefined {
    const matchingTag = event.tags.find((t: string[]) => t[0] === tag);

    if (matchingTag) return matchingTag[1];
}

interface ILoadOpts {
    ids?: string[];
    pubkeys?: string[];
    articleNaddr?: string;
    replies?: string[];
    quotes?: string[];
    limit?: number;
    kind?: number | null;
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

    startStream: (opts: ILoadOpts = {}) => {
        let closeOnEose = false;
        const filter: NDKFilter = {};
        if (opts.kind) {
            if (opts.kind !== null)
                filter['kinds'] = [opts.kind];
        } else {
            filter['kinds'] = [1];
        }
        if (opts.pubkeys) filter['authors'] = opts.pubkeys;
        if (opts.replies) filter['#e'] = opts.replies;
        if (opts.quotes) filter['#q'] = opts.quotes;
        if (opts.ids) {
            filter['ids'] = opts.ids;
            closeOnEose = true;
        }

        if (opts.limit) filter['limit'] = opts.limit;

        let articleReference: string | undefined;

        if (opts.articleNaddr) {
            const ndecode = nip19.decode(opts.articleNaddr).data as any;
            articleReference = `${ndecode.kind}:${ndecode.pubkey}:${ndecode.identifier}`
            filter['#a'] = [articleReference];
        }

        const ndk: NDK = getStore(ndkStore);

        const subs = ndk.subscribe(filter, { closeOnEose, groupableDelay: 500 });

        subs.on('event', processEvent);
    },

    load: (opts: ILoadOpts = {}) => {
        // if querying by ids, check if we have them in the database already
        if (opts.ids) {
            db.notes.where('id').anyOf(opts.ids).toArray().then((notes) => {
                if (notes.length === opts.ids!.length) {
                    console.log('notes from cache', notes.length);
                } else {
                    console.log('notes from cache', notes.length, 'need to fetch', opts.ids!.length - notes.length);
                    NoteInterface.startStream(opts);
                }
            });
        } else {
            NoteInterface.startStream(opts);
        }

        if (opts.pubkeys) {
            return liveQuery(() =>
                db.notes
                    .where('pubkey').anyOf(opts.pubkeys as string[])
                    .limit(opts.limit || 1000)
                    .reverse()
                    .sortBy('createdAt')
            );
        } else if (opts.articleNaddr) {
            const ndecode = nip19.decode(opts.articleNaddr).data as any;
            let articleReference = `${ndecode.kind}:${ndecode.pubkey}:${ndecode.identifier}`

            return liveQuery(() =>
                db.notes.where({replyToArticleId: articleReference}).toArray()
            );
        } else if (opts.replies) {
            return liveQuery(() =>
                db.notes.where('replyToEventId').anyOf(opts.replies!).toArray()
            );
        } else if (opts.quotes) {
            return liveQuery(() =>
                db.notes.where('quotesEventId').anyOf(opts.quotes!).toArray()
            );
        } else if (opts.ids) {
            return liveQuery(() =>
                db.notes.where('id').anyOf(opts.ids!)
                    .reverse()
                    .sortBy('createdAt')
            );
        } else {
            // return liveQuery(() => (db.notes.toArray()));
        }
    }
};

async function processEvent(event: NDKEvent) {
    try {
        const articleId = valueFromTag(event, 'a');
        const eventId = valueFromTag(event, 'e');
        const quotesEventId = valueFromTag(event, 'q');

        const note: App.Note = {
            id: event.tagId(),
            pubkey: event.pubkey,
            content: event.content,
            replyToArticleId: articleId,
            replyToEventId: eventId,
            quotesEventId,
            event: JSON.stringify(event.rawEvent()),
            createdAt: event.created_at!
        };

        await db.notes.put(note);
    } catch (e) {
        console.error(e);
    }
}

export default NoteInterface;

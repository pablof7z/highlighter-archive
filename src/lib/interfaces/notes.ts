import { get, get as getStore } from 'svelte/store';
import ndkStore from '../stores/ndk';
import { liveQuery } from 'dexie';
import { db } from '$lib/interfaces/db';
import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKFilter, NDKUser } from '@nostr-dev-kit/ndk';
import { filterForId } from '$lib/utils';

function valueFromTag(event: NDKEvent, tag: string): string | undefined {
    const matchingTag = event.tags.find((t: string[]) => t[0] === tag);

    if (matchingTag) return matchingTag[1];
}

export interface ILoadOpts {
    ids?: string[];
    pubkeys?: string[];
    articleId?: string;
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
        let filter: NDKFilter = {};
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

        if (opts.articleId) {
            filter = { ...filterForId(opts.articleId), ...filter };
            filter['#a'] = [opts.articleId];
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
                } else {
                    console.log('notes from cache', notes.length, 'need to fetch', opts.ids!.length - notes.length, 'got requested', notes.length, {comparison: notes.length !== opts.ids!.length, idsRequested: opts.ids});
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
        } else if (opts.articleId) {
            return liveQuery(() =>
                db.notes.where({replyToArticleId: opts.articleId!}).toArray()
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
        const note = handleEvent1(event);

        await db.notes.put(note);
    } catch (e) {
        console.error(e);
    }
}

export function handleEvent1(event: NDKEvent): App.Note {
    const articleId = valueFromTag(event, 'a');
    const eventId = valueFromTag(event, 'e');
    const quotesEventId = valueFromTag(event, 'q');

    return  {
        id: event.tagId(),
        pubkey: event.pubkey,
        content: event.content,
        replyToArticleId: articleId,
        replyToEventId: eventId,
        quotesEventId,
        event: JSON.stringify(event.rawEvent()),
        createdAt: event.created_at!
    };
}

export default NoteInterface;

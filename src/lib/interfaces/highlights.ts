import { get as getStore } from 'svelte/store';
import {ndk as ndkStore} from '../store';
import { liveQuery, type Observable } from 'dexie';
import { db } from '$lib/interfaces/db.js';
import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';
import {nip19} from 'nostr-tools';
import { browser } from '$app/environment';
import { idFromNaddr } from '$lib/utils';

function valueFromTag(event: NDKEvent, tag: string): string | undefined {
    const matchingTag = event.tags.find((t: string[]) => t[0] === tag);

    if (matchingTag) return matchingTag[1];
}

export interface ILoadOpts {
    sortBy?: string;
    articleId?: string;
    pubkeys?: string[];
    articleNaddr?: string;
    url?: string;
    ids?: string[];
    limit?: number;
};

// until I add delete support
const blacklistIds = [
    'd7ecc7d8dd63ba0dbbcfcc209fc2d95359e516f39bcc783aabb466d8643ab960', // accidental highlight
];

const HighlightInterface = {
    fromIds: (ids: string[]) => {
        return liveQuery(() =>
            db.highlights.where('id').anyOf(ids).toArray()
        );
    },

    startStream: (opts: ILoadOpts = {}) => {
        let articleReference: string | undefined;
        const ndk: NDK = getStore(ndkStore);
        const filter: NDKFilter = { kinds: [9802] };
        const boostFilter: NDKFilter = { kinds: [6], '#k': ["9802"] };

        if (opts.pubkeys) {
            filter['authors'] = opts.pubkeys;
            boostFilter['authors'] = opts.pubkeys;
        }

        if (opts.ids) filter['ids'] = opts.ids;
        if (opts.articleNaddr) {
            const ndecode = nip19.decode(opts.articleNaddr).data as any;
            articleReference = `${ndecode.kind}:${ndecode.pubkey}:${ndecode.identifier}`
            filter['#a'] = [articleReference];
        }

        if (opts.url) filter['#r'] = [opts.url];

        if (opts.limit) {
            filter['limit'] = opts.limit;
            boostFilter['limit'] = opts.limit;
        }

        const subs = ndk.subscribe(filter, { closeOnEose: false });
        const boostSubs = ndk.subscribe(boostFilter, { closeOnEose: false });

        subs.on('event', eventHandler);
        boostSubs.on('event', eventHandler);

        return [subs, boostSubs];
    },

    loadByArticleIdAndPubkeys(articleId: string, pubkeys: string[] | undefined, opts?: ILoadOpts): Observable<App.Highlight[]> {
        return liveQuery(() =>
            db.highlights.where({articleId})
                .and((highlight: App.Highlight) => pubkeys ? pubkeys.includes(highlight.pubkey) : true)
                .limit(opts?.limit || 100)
                .reverse()
                .sortBy(opts?.sortBy || 'timestamp')
        );
    },


    load: (opts: ILoadOpts = {}): Observable<App.Highlight[]> => {
        if (!browser) return liveQuery(() => Promise.resolve([]) );

        let query: any;

        if (opts.pubkeys && opts.articleId) {
            query = db.highlights.where({articleId: opts.articleId})
                .and((highlight: App.Highlight) => opts.pubkeys!.includes(highlight.pubkey))
        } else if (opts.pubkeys) {
            query = db.highlights.orderBy(opts.sortBy!).filter(h => opts.pubkeys!.includes(h.pubkey));

            // ('pubkey').anyOf(opts.pubkeys as string[])
            //     .or('boostedBy').anyOf(opts.pubkeys as string[]);
        } else if (opts.articleNaddr) {
            let articleReference: string | undefined;
            const ndecode = idFromNaddr(opts.articleNaddr)

            throw new Error('not implemented');

            query = db.highlights.where({articleId: articleReference})
        } else if (opts.articleId) {
            query = db.highlights.where({articleId: opts.articleId});
        } else if (opts.ids) {
            query = db.highlights.where('id').anyOf(opts.ids);
        } else if (opts.url) {
            query = db.highlights.where({url: opts.url});
        } else {
            query = db.highlights;
        }

        if (opts.limit) {
            query = query.reverse().limit(opts.limit);
        }

        if (opts.sortBy) {
            // query = query.orderBy(opts.sortBy).limit(1).toArray();
            console.log(`highlight sorting by ${opts.sortBy}`);
            // query = query.reverse().sortBy(opts.sortBy);
        } else {
            query = query.toArray();
        }

        query = query.toArray();

        return liveQuery(() => query);
    }
};

async function eventHandler(event: NDKEvent) {
    let highlight;

    if (blacklistIds.includes(event.id)) return;

    try {
        switch (event.kind) {
            case 6: highlight = await handleEvent6(event); break;
            case 9802: highlight = await handleEvent9802(event); break;
        }

        if (highlight) db.highlights.put(highlight);

    } catch (e) {
        console.error(e);
    }
}

async function handleEvent6(event: NDKEvent) {
    const boostedEventJson = JSON.parse(event.content);
    const boostedEvent = new NDKEvent(event.ndk, boostedEventJson);

    const highlight = await handleEvent9802(boostedEvent);
    if (!highlight) return;

    highlight.boostedBy = event.pubkey;
    highlight.id = event.id;

    return highlight;
}

export async function handleEvent9802(event: NDKEvent) {
    const articleId = valueFromTag(event, 'a');
    const url = valueFromTag(event, 'r');
    const context = valueFromTag(event, 'context');

    const highlight: App.Highlight = {
        id: event.tagId(),
        url,
        pubkey: event.pubkey,
        content: event.content,
        context,
        articleId,
        timestamp: event.created_at || Math.floor(Date.now() / 1000),
        event: JSON.stringify(await event.toNostrEvent())
    };

    return highlight;
}

export default HighlightInterface;
